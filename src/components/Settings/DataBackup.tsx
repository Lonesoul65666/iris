import { useState, useRef } from 'react';
import { getAllAccounts, saveAccount, getEquityProfile, saveEquityProfile, getUserProfile, saveUserProfile, getMonthlyInvestments, saveMonthlyInvestment, getSetting, saveSetting } from '../../stores/portfolioStore';
import { getBudgetBuckets, saveBudgetBuckets, getSinkingFunds, saveSinkingFunds, getFunMoney, saveFunMoney, getPaycheck, savePaycheck, getExpenses, saveExpense, getCustomCategories, saveCustomCategory } from '../../stores/budgetStore';
import { getActionItems, saveAllActionItems, getMerchantMappings, saveMerchantMapping } from '../../stores/actionStore';

// Merge incoming rows onto current by key: backup overwrites matches, but rows
// only in the current DB are KEPT. Lets restore use the REPLACE savers without
// them deleting live data an older/smaller backup happens to omit.
function mergeByKey<T>(current: T[], incoming: T[], keyOf: (x: T) => string): T[] {
  const map = new Map(current.map(x => [keyOf(x), x]));
  for (const x of incoming) map.set(keyOf(x), x);
  return [...map.values()];
}

export default function DataBackup() {
  const [status, setStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setStatus('Exporting...');
    try {
      const data = {
        version: 1,
        exportDate: new Date().toISOString(),
        accounts: await getAllAccounts(),
        equity: await getEquityProfile(),
        profile: await getUserProfile(),
        investments: await getMonthlyInvestments(),
        buckets: await getBudgetBuckets(),
        sinkingFunds: await getSinkingFunds(),
        funMoney: await getFunMoney(),
        paycheck: await getPaycheck(),
        expenses: await getExpenses(),
        customCategories: await getCustomCategories(),
        merchantMappings: await getMerchantMappings(),
        actionItems: await getActionItems(),
        settings: {
          geminiKey: await getSetting('gemini_api_key'),
          activeUser: await getSetting('active_user'),
        },
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `iris-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('Backup downloaded!');
      setTimeout(() => setStatus(null), 3000);
    } catch (err: any) {
      setStatus(`Export failed: ${err.message}`);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setStatus('Importing...');

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.version || !data.exportDate) {
        throw new Error('Invalid backup file');
      }

      // Restore accounts
      if (data.accounts) {
        for (const a of data.accounts) await saveAccount(a);
      }
      // Restore equity
      if (data.equity) await saveEquityProfile(data.equity);
      // Restore profile
      if (data.profile) await saveUserProfile(data.profile);
      // Restore investments
      if (data.investments) {
        for (const inv of data.investments) await saveMonthlyInvestment(inv);
      }
      // Restore budget — MERGE (never delete): these savers use REPLACE
      // semantics (delete rows absent from the input), so an older/smaller
      // backup would silently wipe live buckets/stashes/pots. Union the backup
      // onto current first so restore only adds/overwrites, never removes.
      if (data.buckets) {
        const merged = mergeByKey(await getBudgetBuckets(), data.buckets, (b: any) => String(b.category));
        await saveBudgetBuckets(merged);
      }
      if (data.sinkingFunds) {
        const merged = mergeByKey(await getSinkingFunds(), data.sinkingFunds, (f: any) => String(f.id));
        await saveSinkingFunds(merged);
      }
      if (data.funMoney) {
        const merged = mergeByKey(await getFunMoney(), data.funMoney, (f: any) => String(f.earnerId ?? f.person));
        await saveFunMoney(merged);
      }
      if (data.paycheck) await savePaycheck(data.paycheck);
      // Restore expenses
      if (data.expenses) {
        for (const exp of data.expenses) await saveExpense(exp);
      }
      // Restore custom categories
      if (data.customCategories) {
        for (const cc of data.customCategories) await saveCustomCategory(cc);
      }
      // Restore merchant mappings
      if (data.merchantMappings) {
        for (const mm of data.merchantMappings) await saveMerchantMapping(mm);
      }
      // Restore action items
      if (data.actionItems) await saveAllActionItems(data.actionItems);
      // Restore settings
      if (data.settings?.geminiKey) await saveSetting('gemini_api_key', data.settings.geminiKey);

      setStatus(`Restored from ${data.exportDate.split('T')[0]}! Reload to see changes.`);
    } catch (err: any) {
      setStatus(`Import failed: ${err.message}`);
    }
    setImporting(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="glass-card p-6">
      <h3 className="font-semibold text-text-primary mb-2">Data Backup & Restore</h3>
      <p className="text-xs text-text-muted mb-4">
        Export a JSON snapshot of your data (accounts, budget, transactions, settings) to keep a safe copy. Restore <strong className="text-text-secondary">merges</strong> a backup into your current data — it adds and overwrites, but never deletes rows you have now.
      </p>
      <div className="flex gap-3">
        <button onClick={handleExport}
          className="px-4 py-2 bg-accent hover:bg-accent-dim rounded-lg text-sm font-medium text-white transition-colors">
          Export Backup
        </button>
        <input type="file" ref={fileRef} accept=".json" className="hidden" onChange={handleImport} />
        <button
          onClick={() => {
            if (!confirmRestore) {
              setConfirmRestore(true);
              setTimeout(() => setConfirmRestore(false), 4000);
              return;
            }
            setConfirmRestore(false);
            fileRef.current?.click();
          }}
          disabled={importing}
          className={`px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 ${
            confirmRestore ? 'bg-warning/20 border border-warning/50 text-warning font-semibold' : 'bg-surface-3 hover:bg-surface-4 text-text-secondary'
          }`}>
          {importing ? 'Importing...' : confirmRestore ? 'Pick a backup file — merges into current data' : 'Restore from Backup'}
        </button>
      </div>
      {status && (
        <p className={`text-xs mt-3 ${status.includes('failed') ? 'text-negative' : 'text-positive'}`}>{status}</p>
      )}
    </div>
  );
}
