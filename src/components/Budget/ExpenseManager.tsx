import { useState, useRef, useCallback, useEffect } from 'react';
import type { Expense, ExpenseCategory, TransactionFlow, TransactionType, TransactionSource, CustomCategory } from '../../types/budget';
import { saveExpense, deleteExpense, getCustomCategories, saveCustomCategory, saveBudgetBuckets, getBudgetBuckets } from '../../stores/budgetStore';
import { getMerchantMappings, saveMerchantMapping, type MerchantMapping } from '../../stores/actionStore';
import { registerCustomCategories } from '../../utils/transactionAnalysis';
import { classifyBankTransaction, guessCategory } from '../../utils/transactionCategorize';

const DEFAULT_CATEGORY_OPTIONS: { value: ExpenseCategory; label: string; icon: string }[] = [
  { value: 'housing', label: 'Housing', icon: '🏠' },
  { value: 'food_groceries', label: 'Groceries', icon: '🛒' },
  { value: 'food_dining', label: 'Dining Out / Takeout', icon: '🍽️' },
  { value: 'childcare', label: 'Childcare / School', icon: '👶' },
  { value: 'transportation', label: 'Gas / Transportation', icon: '🚗' },
  { value: 'utilities', label: 'Utilities', icon: '💡' },
  { value: 'insurance', label: 'Insurance', icon: '🛡️' },
  { value: 'healthcare', label: 'Healthcare / Rx', icon: '🏥' },
  { value: 'subscriptions', label: 'Subscriptions', icon: '📱' },
  { value: 'kids', label: 'Kids', icon: '🎒' },
  { value: 'fun_scott', label: 'Personal Fun (1)', icon: '🎮' },
  { value: 'fun_wife', label: 'Personal Fun (2)', icon: '💅' },
  { value: 'clothing', label: 'Clothing', icon: '👕' },
  { value: 'gifts_holidays', label: 'Gifts / Holidays', icon: '🎁' },
  { value: 'home_maintenance', label: 'Home Maintenance', icon: '🔧' },
  { value: 'car_maintenance', label: 'Car Maintenance', icon: '🔩' },
  { value: 'travel_personal', label: 'Travel (Personal)', icon: '✈️' },
  { value: 'travel_work', label: 'Work Expenses', icon: '💼' },
  { value: 'personal', label: 'Personal Care', icon: '💇' },
  { value: 'charity', label: 'Charity / Donations', icon: '💛' },
  { value: 'entertainment', label: 'Entertainment / Events', icon: '🎟️' },
  { value: 'alcohol', label: 'Alcohol / Liquor', icon: '🍷' },
  { value: 'electronics', label: 'Electronics / Tech', icon: '🖥️' },
  { value: 'education', label: 'Education', icon: '📚' },
  { value: 'pets', label: 'Pets', icon: '🐾' },
  { value: 'other', label: 'Other', icon: '📦' },
];

function formatCurrency(v: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v);
}

interface ParsedTransaction {
  id: string;
  date: string;
  description: string;
  originalDescription: string; // raw from CSV — used for merchant mapping
  displayName: string; // editable name the user sees
  amount: number;
  suggestedCategory: ExpenseCategory;
  isWorkExpense: boolean;
  selected: boolean;
  flow: TransactionFlow;
  transactionType: TransactionType;
  source: TransactionSource;
}

// Detected file format
type FileFormat = 'bofa_txt' | 'bofa_csv' | 'bofa_cc' | 'chase_cc' | 'citi_cc' | 'capital_one_cc' | 'generic_csv';

function detectFileFormat(content: string, filename: string): FileFormat {
  const firstLines = content.split('\n').slice(0, 10).join('\n').toLowerCase();
  const fname = filename.toLowerCase();

  // BofA TXT export — has "Description" header then "Summary Amt." or "Running Bal."
  if (firstLines.includes('running bal') && firstLines.includes('summary amt')) return 'bofa_txt';
  if (firstLines.includes('running bal') && /^\d{2}\/\d{2}\/\d{4}/.test(content.split('\n').find(l => /^\d{2}\//.test(l.trim())) || '')) return 'bofa_txt';

  // CSV formats — check first line as header
  const header = content.split('\n')[0]?.toLowerCase() || '';
  if (header.includes('posted date') && header.includes('payee')) return 'bofa_cc';
  if (header.includes('transaction date') && header.includes('post date') && header.includes('category')) return 'chase_cc';
  if (header.includes('status') && header.includes('date') && header.includes('debit') && header.includes('credit')) return 'citi_cc';
  // Capital One: Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit
  // Must come BEFORE broad Citi fallback — both have debit/credit columns
  if (header.includes('transaction date') && header.includes('card no') && header.includes('debit') && header.includes('credit')) return 'capital_one_cc';
  if (header.includes('transaction date') && (fname.includes('capital') || fname.includes('cap one'))) return 'capital_one_cc';
  // Citi fallback — requires filename hint OR Citi-specific 'status' column (already caught above)
  if (header.includes('transaction date') && header.includes('description') && (fname.includes('citi') || fname.includes('citibank'))) return 'citi_cc';
  if (header.includes('transaction date') && header.includes('description') && header.includes('debit') && header.includes('credit') && !header.includes('card no')) return 'citi_cc';
  if (header.includes('date') && header.includes('description') && header.includes('amount') && header.includes('bal')) return 'bofa_csv';

  return 'generic_csv';
}

function sourceFromFormat(format: FileFormat, filename: string): TransactionSource {
  const f = filename.toLowerCase();
  if (format === 'bofa_txt' || format === 'bofa_csv') {
    if (f.includes('super') || f.includes('saving') || f.includes('3784')) return 'bofa_savings';
    if (f.includes('joint') || f.includes('1006') || f.includes('stuffs') || f.includes('our ')) return 'bofa_joint';
    return 'bofa_checking';
  }
  if (format === 'bofa_cc') return 'credit_card_1';
  if (format === 'citi_cc') return 'credit_card_2';
  if (format === 'capital_one_cc') return 'credit_card_3';
  if (format === 'chase_cc') return 'credit_card_3';
  return 'other';
}


// Parse BofA fixed-width TXT export
function parseBofATxt(content: string): { date: string; description: string; amount: number }[] {
  const lines = content.split('\n');
  const results: { date: string; description: string; amount: number }[] = [];

  for (const rawLine of lines) {
    // Strip \r (Windows line endings) and trailing whitespace — critical for $ anchor
    const line = rawLine.replace(/\r/g, '').trimEnd();

    // Match lines starting with a date: MM/DD/YYYY  description  amount  running_bal
    const match = line.match(/^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s{2,}([-\d,]+\.\d{2})\s+([-\d,]+\.\d{2})$/);
    if (match) {
      const date = match[1];
      const description = match[2].trim();
      const amountStr = match[3].replace(/,/g, '');
      const amount = parseFloat(amountStr);

      // Skip "Beginning balance" rows and $0 entries (fee waivers, balance inquiries)
      if (description.includes('Beginning balance')) continue;
      if (amount === 0) continue;

      results.push({ date, description, amount });
      continue;
    }

    // Fallback: date + description + single number (no running balance column)
    const match2 = line.match(/^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s{2,}([-\d,]+\.\d{2})$/);
    if (match2) {
      const date = match2[1];
      const description = match2[2].trim();
      const amountStr = match2[3].replace(/,/g, '');
      const amount = parseFloat(amountStr);
      if (description.includes('Beginning balance') || amount === 0) continue;
      results.push({ date, description, amount });
    }
  }

  return results;
}

interface ExpenseManagerProps {
  expenses: Expense[];
  onExpensesChanged: () => void;
  geminiAvailable: boolean;
  onAnalyzeWithGemini?: (text: string) => Promise<string>;
}

export default function ExpenseManager({ expenses, onExpensesChanged, geminiAvailable }: ExpenseManagerProps) {
  const [tab, setTab] = useState<'list' | 'add' | 'import'>('list');
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[]>([]);
  const [importWarnings, setImportWarnings] = useState<{ warnings: string[]; dupCount: number; doubleChargeCount: number; totalParsed: number } | null>(null);
  const [manualForm, setManualForm] = useState({ date: new Date().toISOString().split('T')[0], description: '', amount: '', category: 'other' as ExpenseCategory, isWork: false });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [showNewCatForm, setShowNewCatForm] = useState(false);
  const [newCatForm, setNewCatForm] = useState({ label: '', icon: '📌' });
  // Tracks which dropdown triggered the "new category" form so we can apply the result
  const [pendingCategoryTarget, setPendingCategoryTarget] = useState<
    { type: 'expense'; id: string } | { type: 'manual' } | { type: 'import'; id: string } | null
  >(null);

  // Load custom categories on mount
  useEffect(() => { getCustomCategories().then(setCustomCategories); }, []);

  // Merged category list: defaults + custom
  const CATEGORY_OPTIONS = [
    ...DEFAULT_CATEGORY_OPTIONS,
    ...customCategories.map(c => ({ value: c.id as ExpenseCategory, label: c.label, icon: c.icon })),
  ];

  // Create a new custom category
  const handleCreateCategory = useCallback(async () => {
    const label = newCatForm.label.trim();
    if (!label) return;
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (CATEGORY_OPTIONS.some(c => c.value === id)) return; // already exists

    const custom: CustomCategory = { id, label, icon: newCatForm.icon || '📌', color: '#818cf8' };
    await saveCustomCategory(custom);
    setCustomCategories(prev => [...prev, custom]);
    registerCustomCategories([custom]);

    // Auto-create a budget bucket for it
    const buckets = await getBudgetBuckets();
    if (!buckets.find(b => b.category === id)) {
      buckets.push({
        category: id as ExpenseCategory,
        label,
        icon: custom.icon,
        monthlyBudget: 0,
        monthlyActual: 0,
        color: custom.color,
        guideline: 'Custom category',
        guidelinePercent: 0,
      });
      await saveBudgetBuckets(buckets);
    }

    setNewCatForm({ label: '', icon: '📌' });
    setShowNewCatForm(false);

    // Apply the new category to whatever triggered the form
    if (pendingCategoryTarget) {
      const target = pendingCategoryTarget;
      setPendingCategoryTarget(null);
      if (target.type === 'expense') {
        const exp = expenses.find(e => e.id === target.id);
        if (exp) {
          await saveExpense({ ...exp, category: id });
          await saveMerchantMapping({ original: exp.description, displayName: exp.description, category: id as ExpenseCategory, isWorkExpense: exp.isWorkExpense });
          onExpensesChanged();
        }
      } else if (target.type === 'manual') {
        setManualForm(f => ({ ...f, category: id as ExpenseCategory }));
      } else if (target.type === 'import') {
        setParsedTransactions(prev => prev.map(t => t.id === target.id ? { ...t, suggestedCategory: id as ExpenseCategory } : t));
      }
    }
  }, [newCatForm, CATEGORY_OPTIONS, pendingCategoryTarget, expenses, onExpensesChanged]);

  // Manual entry
  const handleManualAdd = useCallback(async () => {
    if (!manualForm.description || !manualForm.amount) return;
    const expense: Expense = {
      id: Date.now().toString(),
      date: manualForm.date,
      description: manualForm.description,
      amount: parseFloat(manualForm.amount),
      category: manualForm.category,
      reimbursementStatus: manualForm.isWork ? 'pending' : 'not_reimbursable',
      isWorkExpense: manualForm.isWork,
      recurring: false,
    };
    await saveExpense(expense);
    setManualForm({ date: new Date().toISOString().split('T')[0], description: '', amount: '', category: 'other', isWork: false });
    onExpensesChanged();
  }, [manualForm, onExpensesChanged]);

  // Multi-format import — handles BofA TXT, BofA CSV, credit card CSVs
  // Supports stacking multiple files (one per account)
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const mappings = await getMerchantMappings();
    const mappingLookup = new Map<string, MerchantMapping>();
    for (const m of mappings) mappingLookup.set(m.original.toLowerCase(), m);

    const allParsed: ParsedTransaction[] = [];

    for (const file of Array.from(files)) {
      const text = await file.text();
      if (text.trim().length < 20) continue;

      const format = detectFileFormat(text, file.name);
      const source = sourceFromFormat(format, file.name);
      const batchId = `batch-${file.name}-${Date.now()}`;

      if (format === 'bofa_txt') {
        // ── BofA TXT (fixed-width) — checking, savings, or joint ──
        const rows = parseBofATxt(text);
        for (let i = 0; i < rows.length; i++) {
          const { date, description, amount } = rows[i];
          const classified = classifyBankTransaction(description, amount);
          const absAmount = Math.abs(amount);

          const mapping = mappingLookup.get(description.toLowerCase());
          const displayName = mapping?.displayName || cleanMerchantName(description);
          const category = classified.type === 'expense' ? (mapping?.category as ExpenseCategory || classified.category) : classified.category;
          const isWork = mapping?.isWorkExpense ?? (classified.type === 'expense' && guessWorkExpense(description));

          allParsed.push({
            id: `${batchId}-${i}`,
            date,
            description,
            originalDescription: description,
            displayName,
            amount: absAmount,
            suggestedCategory: category,
            isWorkExpense: isWork,
            selected: classified.type !== 'transfer', // Auto-deselect transfers
            flow: classified.flow,
            transactionType: classified.type,
            source,
          });
        }
      } else {
        // ── CSV formats (credit cards, BofA CSV, generic) ──
        const lines = text.split('\n').map(l => l.replace(/\r/g, '')).filter(l => l.trim());
        if (lines.length < 2) continue;

        for (let i = 1; i < lines.length; i++) {
          // Proper CSV parser that handles quoted fields with commas
          const cols: string[] = [];
          let cur = '', inQ = false;
          for (let ch of lines[i]) {
            if (ch === '"') inQ = !inQ;
            else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
            else cur += ch;
          }
          cols.push(cur.trim());
          if (cols.length < 3) continue;

          let date = '', rawDesc = '', rawAmount = 0;
          let flow: TransactionFlow = 'outflow';
          let txType: TransactionType = 'expense';
          let category: ExpenseCategory = 'other';

          if (format === 'bofa_cc') {
            date = cols[0]; rawDesc = cols[2] || cols[1];
            rawAmount = parseFloat(cols[4] || cols[3] || '0');
            if (isNaN(rawAmount)) continue;
            if (rawAmount < 0) { flow = 'inflow'; txType = 'refund'; rawAmount = Math.abs(rawAmount); }
          } else if (format === 'chase_cc') {
            date = cols[0]; rawDesc = cols[2];
            rawAmount = parseFloat(cols[5] || '0');
            if (isNaN(rawAmount)) continue;
            if (rawAmount > 0) { flow = 'inflow'; txType = 'refund'; } else { rawAmount = Math.abs(rawAmount); }
          } else if (format === 'citi_cc') {
            // Citi: Status,Date,"Description",Debit,Credit,Member Name
            // Skip Status column — cols[0]=Status, cols[1]=Date, cols[2]=Description, cols[3]=Debit, cols[4]=Credit, cols[5]=Member Name
            const status = cols[0]?.toLowerCase();
            if (status === 'status') continue; // skip header row if still present
            date = cols[1];
            rawDesc = cols[2]?.replace(/"/g, '') || '';
            const debitStr = cols[3]?.replace(/,/g, '').trim();
            const creditStr = cols[4]?.replace(/,/g, '').trim();
            const debit = debitStr ? parseFloat(debitStr) : 0;
            const credit = creditStr ? parseFloat(creditStr) : 0;
            const memberName = cols[5]?.trim() || '';

            if (debit > 0) {
              rawAmount = debit; flow = 'outflow'; txType = 'expense';
            } else if (credit !== 0) {
              rawAmount = Math.abs(credit); flow = 'inflow';
              // Large credits = card payments (transfer), small = refunds/cashback
              if (rawDesc.toLowerCase().includes('online payment') || Math.abs(credit) > 500) txType = 'transfer';
              else txType = 'refund';
            } else continue;

            // Normalize date to MM/DD/YYYY (CitiBank1.csv uses M/D/YYYY without leading zeros)
            const dateParts = date.split('/');
            if (dateParts.length === 3) {
              date = dateParts[0].padStart(2, '0') + '/' + dateParts[1].padStart(2, '0') + '/' + dateParts[2];
            }

            // Tag who spent it — LILLAH = Claire, SCOTT = Scott
            if (memberName.includes('LILLAH')) {
              rawDesc = rawDesc + ' [Claire]';
            }
          } else if (format === 'capital_one_cc') {
            // Capital One: Transaction Date, Posted Date, Card No., Description, Category, Debit, Credit
            date = cols[0]; // YYYY-MM-DD format
            rawDesc = cols[3] || '';
            // cols[4] = Capital One's own category (unused — we classify ourselves)
            const debit = parseFloat((cols[5] || '').replace(/,/g, '')) || 0;
            const credit = parseFloat((cols[6] || '').replace(/,/g, '')) || 0;

            if (debit > 0) {
              rawAmount = debit; flow = 'outflow'; txType = 'expense';
              // Skip interest charges
              if (rawDesc.toLowerCase().includes('interest charge')) txType = 'expense'; // still track, but could filter
            } else if (credit > 0) {
              rawAmount = credit; flow = 'inflow';
              if (rawDesc.toLowerCase().includes('mobile pymt') || rawDesc.toLowerCase().includes('payment')) txType = 'transfer';
              else txType = 'refund';
            } else continue;

            // Convert YYYY-MM-DD to MM/DD/YYYY for consistency
            if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
              const [y, m, dd] = date.split('-');
              date = m + '/' + dd + '/' + y;
            }
          } else {
            date = cols[0]; rawDesc = cols[1] || '';
            rawAmount = parseFloat(cols[2] || '0');
            if (isNaN(rawAmount)) continue;
            if (rawAmount > 0) { flow = 'inflow'; txType = 'income'; } else { rawAmount = Math.abs(rawAmount); }
          }

          if (rawAmount === 0) continue;

          // For credit cards: payments TO the card are transfers
          if (flow === 'inflow' && (rawDesc.toLowerCase().includes('payment') || rawDesc.toLowerCase().includes('autopay'))) {
            txType = 'transfer';
          }

          const mapping = mappingLookup.get(rawDesc.toLowerCase());
          const displayName = mapping?.displayName || cleanMerchantName(rawDesc);
          if (txType === 'expense') category = mapping?.category as ExpenseCategory || guessCategory(rawDesc);
          const isWork = mapping?.isWorkExpense ?? (txType === 'expense' && guessWorkExpense(rawDesc));

          allParsed.push({
            id: `${batchId}-${i}`,
            date, description: rawDesc, originalDescription: rawDesc, displayName,
            amount: rawAmount, suggestedCategory: category, isWorkExpense: isWork,
            selected: txType !== 'transfer',
            flow, transactionType: txType, source,
          });
        }
      }
    }

    // ══════════════════════════════════════════════════════════════
    // IMPORT DEDUP — "Did I already upload this exact file?"
    // ══════════════════════════════════════════════════════════════
    // Strict key: date + amount + source + first 20 chars of raw description.
    // This catches re-importing the same file, but WON'T flag two different
    // Uber rides at the same price (different descriptions like "UBER *TRIP" with different conf#s).
    // Cross-account matches are impossible (different source).
    const existingKeys = new Set(
      expenses.map(e => {
        const descKey = (e.description || '').replace(/⚠️.*?:\s*/, '').slice(0, 20).toLowerCase();
        return `${e.date}|${Math.abs(e.amount).toFixed(2)}|${e.source || 'unknown'}|${descKey}`;
      })
    );

    let dupCount = 0;
    const deduped = allParsed.map(t => {
      const descKey = t.originalDescription.slice(0, 20).toLowerCase();
      const key = `${t.date}|${t.amount.toFixed(2)}|${t.source}|${descKey}`;
      if (existingKeys.has(key)) {
        dupCount++;
        return { ...t, selected: false, displayName: `⚠️ ALREADY IMPORTED: ${t.displayName}` };
      }
      return t;
    });

    // ══════════════════════════════════════════════════════════════
    // DOUBLE-CHARGE DETECTION — "Did a merchant charge me twice?"
    // ══════════════════════════════════════════════════════════════
    // Same date + same amount + same source + similar merchant name = suspicious.
    // This catches real double charges / fraud. DON'T deselect — just flag.
    // Two $25 Starbucks reloads = legit. Two $361.66 HEB charges = probably not.
    const chargeGroups = new Map<string, number[]>();
    deduped.forEach((t, idx) => {
      if (t.transactionType !== 'expense' || t.displayName.startsWith('⚠️')) return;
      // Group by date + amount + first word of merchant (catches "UBER *TRIP" variants)
      const merchant = t.displayName.split(/[\s*#]/)[0].toLowerCase().slice(0, 10);
      const groupKey = `${t.date}|${t.amount.toFixed(2)}|${t.source}|${merchant}`;
      if (!chargeGroups.has(groupKey)) chargeGroups.set(groupKey, []);
      chargeGroups.get(groupKey)!.push(idx);
    });

    let doubleChargeCount = 0;
    const flagged = [...deduped];
    for (const [, indices] of chargeGroups) {
      if (indices.length > 1) {
        // Flag all but the first as possible double charges
        for (let i = 1; i < indices.length; i++) {
          const t = flagged[indices[i]];
          if (!t.displayName.startsWith('⚠️')) {
            flagged[indices[i]] = { ...t, displayName: `🔔 DOUBLE CHARGE? ${t.displayName}` };
            doubleChargeCount++;
          }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════
    // SANITY CHECKS — catch format misdetection before review
    // ══════════════════════════════════════════════════════════════
    const warnings: string[] = [];
    const totalParsed = flagged.length;
    const expenseCount = flagged.filter(t => t.transactionType === 'expense').length;
    const transferCount = flagged.filter(t => t.transactionType === 'transfer').length;
    const maxSingle = Math.max(...flagged.map(t => t.amount), 0);

    if (totalParsed === 0) warnings.push('No transactions were parsed. The file format may not be recognized — try a different export format.');
    if (expenseCount === 0 && transferCount === totalParsed && totalParsed > 0) warnings.push('Every transaction was classified as a transfer. Is the source account correct? Check the dropdown.');
    if (maxSingle > 50000) warnings.push(`Largest transaction: ${formatCurrency(maxSingle)}. Verify this is correct.`);
    if (dupCount > totalParsed * 0.7 && totalParsed > 5) warnings.push(`${dupCount} of ${totalParsed} already imported. You may have uploaded this file before.`);

    // Store warnings for inline display (no more popups)
    setImportWarnings({ warnings, dupCount, doubleChargeCount, totalParsed });

    setParsedTransactions(prev => [...prev, ...flagged]);
    setTab('import');
    e.target.value = '';
  }, [expenses]);

  // Save imported transactions and merchant mappings
  const handleSaveImported = useCallback(async () => {
    const selected = parsedTransactions.filter(t => t.selected);
    for (const t of selected) {
      const expense: Expense = {
        id: t.id,
        date: t.date,
        description: t.displayName || t.description,
        amount: t.amount,
        category: t.suggestedCategory,
        reimbursementStatus: t.isWorkExpense ? 'pending' : 'not_reimbursable',
        isWorkExpense: t.isWorkExpense,
        recurring: false,
        flow: t.flow,
        transactionType: t.transactionType,
        source: t.source,
        importBatch: t.id.split('-').slice(0, 2).join('-'),
      };
      await saveExpense(expense);

      // Save merchant mapping for future imports if user changed anything (name, category, or work flag)
      if (t.flow === 'outflow') {
        const autoName = cleanMerchantName(t.originalDescription);
        const autoCategory = guessCategory(t.originalDescription);
        const autoWork = guessWorkExpense(t.originalDescription);
        if (t.displayName !== autoName || t.suggestedCategory !== autoCategory || t.isWorkExpense !== autoWork) {
          await saveMerchantMapping({
            original: t.originalDescription,
            displayName: t.displayName,
            category: t.suggestedCategory,
            isWorkExpense: t.isWorkExpense,
          });
        }
      }
    }
    setParsedTransactions([]);
    setImportWarnings(null);
    setTab('list');
    onExpensesChanged();
  }, [parsedTransactions, onExpensesChanged]);

  // Toggle work/personal for imported transaction
  const toggleWork = useCallback((id: string) => {
    setParsedTransactions(prev => prev.map(t =>
      t.id === id ? { ...t, isWorkExpense: !t.isWorkExpense } : t
    ));
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setParsedTransactions(prev => prev.map(t =>
      t.id === id ? { ...t, selected: !t.selected } : t
    ));
  }, []);

  const updateCategory = useCallback((id: string, category: ExpenseCategory) => {
    setParsedTransactions(prev => prev.map(t =>
      t.id === id ? { ...t, suggestedCategory: category } : t
    ));
  }, []);

  const updateDisplayName = useCallback((id: string, name: string) => {
    setParsedTransactions(prev => prev.map(t =>
      t.id === id ? { ...t, displayName: name } : t
    ));
  }, []);

  // Group and summarize transactions
  const sortedExpenses = [...expenses].sort((a, b) => b.date.localeCompare(a.date));
  const realExpenses = expenses.filter(e => (e.flow || 'outflow') === 'outflow' && (e.transactionType || 'expense') === 'expense');
  // Work expenses match EITHER the explicit isWorkExpense flag OR the
  // travel_work category — both signals count. Personal spend excludes both.
  const isWorkExp = (e: Expense) => e.isWorkExpense || e.category === 'travel_work';
  const totalPersonal = realExpenses.filter(e => !isWorkExp(e)).reduce((s, e) => s + e.amount, 0);
  const totalIncome = expenses.filter(e => e.flow === 'inflow' && e.transactionType === 'income').reduce((s, e) => s + e.amount, 0);
  const totalTransfers = expenses.filter(e => e.transactionType === 'transfer').reduce((s, e) => s + e.amount, 0);
  const [flowFilter, setFlowFilter] = useState<'all' | 'outflow' | 'inflow'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [showCategorySummary, setShowCategorySummary] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const filteredExpenses = sortedExpenses.filter(e => {
    if (flowFilter !== 'all' && (e.flow || 'outflow') !== flowFilter) return false;
    if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
    if (sourceFilter !== 'all' && (e.source || 'unknown') !== sourceFilter) return false;
    // Search by description (case-insensitive substring)
    if (searchQuery && !e.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    // Category dropdown filter
    if (filterCategory !== 'all' && e.category !== filterCategory) return false;
    // Date range filters (compare YYYY-MM prefix against YYYY-MM-DD dates)
    if (filterDateFrom) {
      const expMonth = e.date.slice(0, 7); // YYYY-MM
      if (expMonth < filterDateFrom) return false;
    }
    if (filterDateTo) {
      const expMonth = e.date.slice(0, 7);
      if (expMonth > filterDateTo) return false;
    }
    return true;
  });

  // Category summary — totals by category for real expenses only
  const categorySummary = realExpenses.reduce((acc, e) => {
    const cat = e.category || 'other';
    if (!acc[cat]) acc[cat] = { count: 0, total: 0 };
    acc[cat].count++;
    acc[cat].total += e.amount;
    return acc;
  }, {} as Record<string, { count: number; total: number }>);

  // Unique categories present in transactions (for filter dropdown)
  const transactionCategories = [...new Set(expenses.map(e => e.category))].sort();

  // Source summary
  const sources = [...new Set(expenses.map(e => e.source || 'unknown'))].filter(s => s !== 'unknown');

  const SOURCE_LABELS: Record<string, string> = {
    bofa_checking: 'Checking',
    bofa_savings: 'Savings',
    bofa_joint: 'Joint',
    credit_card_1: 'Credit Card 1',
    credit_card_2: 'Credit Card 2',
    credit_card_3: 'Credit Card 3',
    venmo: 'Venmo',
    other: 'Other',
  };
  const TYPE_BADGES: Record<string, { label: string; color: string }> = {
    expense: { label: 'Expense', color: 'text-text-secondary bg-white/5' },
    income: { label: 'Income', color: 'text-positive bg-positive/10' },
    reimbursement: { label: 'Reimb.', color: 'text-cyan-400 bg-cyan-500/10' },
    transfer: { label: 'Transfer', color: 'text-text-muted bg-white/3' },
    investment: { label: 'Invest', color: 'text-accent-light bg-accent/10' },
    refund: { label: 'Refund', color: 'text-positive bg-positive/10' },
  };

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-2">
        {(['list', 'add', 'import'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t ? 'bg-accent/15 text-accent-light' : 'text-text-secondary hover:bg-white/5'
            }`}>
            {t === 'list' ? `Transactions (${expenses.length})` : t === 'add' ? '+ Add Manual' : '📄 Import'}
          </button>
        ))}
      </div>

      {/* List View */}
      {tab === 'list' && (
        <div className="space-y-3">
          {expenses.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <div className="text-4xl mb-3">📊</div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">No Transactions Yet</h3>
              <p className="text-text-secondary text-sm mb-4">
                Add transactions manually or import from your BofA / credit card statements.
                Upload a CSV or screenshot and Iris will categorize them.
              </p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => setTab('add')} className="px-4 py-2 bg-accent hover:bg-accent-dim rounded-lg text-sm font-medium text-white transition-colors">
                  + Add Manually
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-surface-3 hover:bg-surface-4 rounded-lg text-sm text-text-secondary transition-colors">
                  📄 Import File
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Stats bar — Work removed; Avg Work Expenses tile in Budget overview is canonical. */}
              <div className="flex flex-wrap gap-4 text-sm items-center">
                <span className="text-text-muted">Spending: <strong className="text-text-primary">{formatCurrency(totalPersonal)}</strong></span>
                {totalIncome > 0 && <span className="text-text-muted">Income: <strong className="text-positive">{formatCurrency(totalIncome)}</strong></span>}
                {totalTransfers > 0 && <span className="text-text-muted">Transfers: <strong className="text-text-muted">{formatCurrency(totalTransfers)}</strong></span>}
                <div className="flex-1" />
                <button onClick={() => setShowCategorySummary(!showCategorySummary)}
                  className={`px-2 py-0.5 rounded text-xs transition-colors ${showCategorySummary ? 'bg-accent/15 text-accent-light' : 'text-text-muted hover:bg-white/5'}`}>
                  {showCategorySummary ? '▼ Categories' : '▶ Categories'}
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1 bg-surface-3 hover:bg-surface-4 rounded-lg text-xs text-text-secondary transition-colors">
                  + Import More Files
                </button>
              </div>

              {/* Search & Filter Bar */}
              <div className="flex flex-wrap gap-3 items-center mb-4">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search transactions..."
                  className="flex-1 min-w-[200px] bg-surface-2 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/50"
                />
                <select
                  value={filterCategory}
                  onChange={e => setFilterCategory(e.target.value)}
                  className="w-48 bg-surface-2 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/50"
                >
                  <option value="all">All Categories</option>
                  {transactionCategories.map(cat => {
                    const info = CATEGORY_OPTIONS.find(c => c.value === cat);
                    return <option key={cat} value={cat}>{info ? `${info.icon} ${info.label}` : cat}</option>;
                  })}
                </select>
                <input
                  type="month"
                  value={filterDateFrom}
                  onChange={e => setFilterDateFrom(e.target.value)}
                  className="bg-surface-2 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/50"
                  title="From month"
                />
                <span className="text-text-muted text-xs">to</span>
                <input
                  type="month"
                  value={filterDateTo}
                  onChange={e => setFilterDateTo(e.target.value)}
                  className="bg-surface-2 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/50"
                  title="To month"
                />
                <span className="text-xs text-text-muted whitespace-nowrap">
                  Showing {filteredExpenses.length} of {expenses.length} transactions
                </span>
              </div>

              {/* Category summary panel */}
              {showCategorySummary && (
                <div className="glass-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-text-primary">Spending by Category</h3>
                    <span className="text-xs text-text-muted">{realExpenses.length} expense transactions</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {Object.entries(categorySummary)
                      .sort((a, b) => b[1].total - a[1].total)
                      .map(([cat, data]) => {
                        const catInfo = CATEGORY_OPTIONS.find(c => c.value === cat);
                        const isActive = categoryFilter === cat;
                        return (
                          <button key={cat} onClick={() => setCategoryFilter(isActive ? 'all' : cat)}
                            className={`p-2 rounded-lg text-left transition-all ${isActive ? 'bg-accent/15 border border-accent/30' : 'bg-white/[0.03] border border-glass-border hover:bg-white/[0.05]'}`}>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-text-secondary">{catInfo?.icon || '📦'} {catInfo?.label || cat}</span>
                              <span className="text-[10px] text-text-muted">{data.count}</span>
                            </div>
                            <div className="text-sm font-semibold text-text-primary mt-0.5">{formatCurrency(data.total)}</div>
                          </button>
                        );
                      })}
                  </div>
                  {categoryFilter !== 'all' && (
                    <button onClick={() => setCategoryFilter('all')} className="mt-2 text-xs text-accent hover:underline">
                      Clear filter — showing {CATEGORY_OPTIONS.find(c => c.value === categoryFilter)?.label || categoryFilter}
                    </button>
                  )}
                </div>
              )}

              {/* Filters row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-text-muted">Filter:</span>
                <div className="flex gap-1">
                  {(['all', 'outflow', 'inflow'] as const).map(f => (
                    <button key={f} onClick={() => setFlowFilter(f)}
                      className={`px-2 py-0.5 rounded text-xs transition-colors ${flowFilter === f ? 'bg-accent/15 text-accent-light' : 'text-text-muted hover:bg-white/5'}`}>
                      {f === 'all' ? 'All' : f === 'outflow' ? '↓ Out' : '↑ In'}
                    </button>
                  ))}
                </div>
                {sources.length > 1 && (
                  <>
                    <span className="text-xs text-text-muted ml-2">Source:</span>
                    <div className="flex gap-1">
                      <button onClick={() => setSourceFilter('all')}
                        className={`px-2 py-0.5 rounded text-xs transition-colors ${sourceFilter === 'all' ? 'bg-accent/15 text-accent-light' : 'text-text-muted hover:bg-white/5'}`}>
                        All
                      </button>
                      {sources.map(src => (
                        <button key={src} onClick={() => setSourceFilter(sourceFilter === src ? 'all' : src)}
                          className={`px-2 py-0.5 rounded text-xs transition-colors ${sourceFilter === src ? 'bg-accent/15 text-accent-light' : 'text-text-muted hover:bg-white/5'}`}>
                          {SOURCE_LABELS[src] || src}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div className="flex-1" />
                <span className="text-xs text-text-muted">{filteredExpenses.length} transactions</span>
              </div>
              <div className="glass-card overflow-hidden max-h-[600px] overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-surface-1 z-10">
                    <tr className="text-xs text-text-muted uppercase tracking-wider">
                      <th className="text-left p-3">Date</th>
                      <th className="text-left p-3">Description</th>
                      <th className="text-left p-3">Source</th>
                      <th className="text-left p-3">Type</th>
                      <th className="text-left p-3">Category</th>
                      <th className="text-right p-3">Amount</th>
                      <th className="text-center p-3">Tag</th>
                      <th className="p-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.map(e => {
                      const flow = e.flow || 'outflow';
                      const txType = e.transactionType || 'expense';
                      const badge = TYPE_BADGES[txType] || TYPE_BADGES.expense;
                      const isTransferOrInvestment = txType === 'transfer' || txType === 'investment';
                      return (
                        <tr key={e.id} className={`border-t border-glass-border hover:bg-white/[0.02] group ${isTransferOrInvestment ? 'opacity-50' : ''}`}>
                          <td className="p-3 text-xs text-text-muted font-mono whitespace-nowrap">{e.date}</td>
                          <td className="p-3">
                            <input type="text" value={e.description}
                              onChange={async (ev) => {
                                const updated = { ...e, description: ev.target.value };
                                await saveExpense(updated);
                                onExpensesChanged();
                              }}
                              className="bg-transparent border border-transparent group-hover:border-glass-border rounded px-1 py-0.5 text-sm text-text-primary outline-none focus:border-accent/50 w-full"
                            />
                          </td>
                          <td className="p-3">
                            {e.source && <span className="text-[10px] text-text-muted whitespace-nowrap">{SOURCE_LABELS[e.source] || e.source}</span>}
                          </td>
                          <td className="p-3">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${badge.color} whitespace-nowrap`}>{flow === 'inflow' ? '↑ ' : '↓ '}{badge.label}</span>
                          </td>
                          <td className="p-3">
                            {txType === 'expense' && (
                              <select value={e.category}
                                onChange={async (ev) => {
                                  if (ev.target.value === '__new__') {
                                    setPendingCategoryTarget({ type: 'expense', id: e.id });
                                    setShowNewCatForm(true);
                                    ev.target.value = e.category; // reset visual
                                    return;
                                  }
                                  const updated = { ...e, category: ev.target.value };
                                  await saveExpense(updated);
                                  // Remember this category for future imports of same merchant
                                  await saveMerchantMapping({ original: e.description, displayName: e.description, category: ev.target.value as ExpenseCategory, isWorkExpense: e.isWorkExpense });
                                  onExpensesChanged();
                                }}
                                className="bg-transparent border border-transparent group-hover:border-glass-border rounded px-1 py-0.5 text-xs text-text-secondary outline-none focus:border-accent/50">
                                {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
                                <option value="__new__">➕ New Category...</option>
                              </select>
                            )}
                          </td>
                          <td className={`p-3 text-right text-sm font-medium ${flow === 'inflow' ? 'text-positive' : 'text-text-primary'}`}>
                            {flow === 'inflow' ? '+' : ''}{formatCurrency(e.amount)}
                          </td>
                          <td className="p-3 text-center">
                            {txType === 'expense' && (
                              <button onClick={async () => {
                                const updated: Expense = { ...e, isWorkExpense: !e.isWorkExpense, reimbursementStatus: !e.isWorkExpense ? 'pending' : 'not_reimbursable' };
                                await saveExpense(updated);
                                onExpensesChanged();
                              }}
                                className={`text-xs px-2 py-1 rounded-full transition-colors ${
                                  e.isWorkExpense ? 'bg-warning/15 text-warning' : 'bg-white/5 text-text-muted hover:bg-white/10'
                                }`}>
                                {e.isWorkExpense ? '💼' : '🏠'}
                              </button>
                            )}
                          </td>
                          <td className="p-3">
                            <button onClick={async () => {
                              await deleteExpense(e.id);
                              onExpensesChanged();
                            }}
                              className="text-text-muted hover:text-negative opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                              title="Delete transaction">
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Manual Add */}
      {tab === 'add' && (
        <div className="glass-card p-6 space-y-4 max-w-lg">
          <h3 className="font-semibold text-text-primary">Add Transaction</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-text-muted mb-1 block">Date</label>
              <input type="date" value={manualForm.date} onChange={e => setManualForm(f => ({ ...f, date: e.target.value }))}
                className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50" />
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Amount</label>
              <input type="number" step="0.01" placeholder="0.00" value={manualForm.amount}
                onChange={e => setManualForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50" />
            </div>
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">Description</label>
            <input type="text" placeholder="e.g., HEB groceries, Uber to DFW" value={manualForm.description}
              onChange={e => setManualForm(f => ({ ...f, description: e.target.value }))}
              className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50" />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">Category</label>
            <select value={manualForm.category} onChange={e => {
                if (e.target.value === '__new__') {
                  setPendingCategoryTarget({ type: 'manual' });
                  setShowNewCatForm(true);
                  e.target.value = manualForm.category; // reset visual
                  return;
                }
                setManualForm(f => ({ ...f, category: e.target.value as ExpenseCategory }));
              }}
              className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50">
              {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
              <option value="__new__">➕ New Category...</option>
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={manualForm.isWork} onChange={e => setManualForm(f => ({ ...f, isWork: e.target.checked }))}
              className="rounded border-glass-border bg-surface-3 text-accent" />
            <span className="text-sm text-text-secondary">This is a work expense (reimbursable)</span>
          </label>
          <button onClick={handleManualAdd} disabled={!manualForm.description || !manualForm.amount}
            className="px-4 py-2 bg-accent hover:bg-accent-dim rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-30">
            Add Transaction
          </button>
        </div>
      )}

      {/* Import View */}
      {tab === 'import' && (
        <div className="space-y-4">
          {parsedTransactions.length === 0 ? (
            <div className="glass-card p-8 text-center space-y-4">
              <h3 className="text-lg font-semibold text-text-primary">Import Transactions</h3>
              <p className="text-text-secondary text-sm">Select all your files at once — Iris processes them in batch and auto-categorizes everything.</p>
              <div className="flex gap-3 justify-center">
                <input type="file" ref={fileInputRef} accept=".csv,.txt,.tsv,.xlsx,.xls" multiple className="hidden" onChange={handleFileUpload} />
                <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-accent hover:bg-accent-dim rounded-lg text-sm font-medium text-white transition-colors">
                  📄 Select Files (multi-select)
                </button>
                <input type="file" ref={screenshotInputRef} accept="image/*" className="hidden"
                  onChange={() => { /* TODO: Gemini screenshot analysis */ }} />
                <button onClick={() => screenshotInputRef.current?.click()}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${geminiAvailable ? 'bg-surface-3 hover:bg-surface-4 text-text-secondary' : 'bg-surface-3 text-text-muted opacity-50 cursor-not-allowed'}`}
                  disabled={!geminiAvailable}>
                  📸 Upload Screenshot {!geminiAvailable && '(needs API key)'}
                </button>
              </div>
              <div className="text-xs text-text-muted space-y-1">
                <p><strong>Supported formats:</strong></p>
                <p>🏦 BofA checking/savings — deposits, withdrawals, transfers</p>
                <p>💳 BofA credit card — charges, payments, refunds</p>
                <p>💳 Chase credit card — purchases, credits</p>
                <p>📄 Any other CSV with Date, Description, Amount columns</p>
                <p className="mt-2">Upload multiple files — Iris tracks which account each transaction came from and filters out transfers between your own accounts.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Detected source banner with override */}
              {(() => {
                const detectedSources = [...new Set(parsedTransactions.map(t => t.source))];
                return (
                  <div className="glass-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-text-primary">{parsedTransactions.length} transactions found</h3>
                      <div className="flex gap-2">
                        <button onClick={() => setParsedTransactions(prev => prev.map(t => ({ ...t, selected: true })))}
                          className="text-xs text-accent hover:underline">Select all</button>
                        <button onClick={() => setParsedTransactions(prev => prev.map(t => ({ ...t, selected: false })))}
                          className="text-xs text-text-muted hover:underline">Deselect all</button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03] border border-glass-border">
                      <span className="text-xs text-text-muted">Detected source:</span>
                      <select
                        value={detectedSources[0] || 'other'}
                        onChange={(e) => {
                          const newSource = e.target.value as TransactionSource;
                          setParsedTransactions(prev => prev.map(t => ({ ...t, source: newSource })));
                        }}
                        className="bg-surface-2 border border-glass-border rounded-lg px-3 py-1 text-sm text-text-primary outline-none focus:border-accent/50"
                      >
                        <option value="bofa_checking">🏦 BofA Checking (8256)</option>
                        <option value="bofa_savings">🏦 BofA Savings (3784)</option>
                        <option value="bofa_joint">🏦 BofA Joint — Our Stuffs (1006)</option>
                        <option value="credit_card_1">💳 BofA Credit Card</option>
                        <option value="credit_card_2">💳 Citi Credit Card</option>
                        <option value="credit_card_3">💳 Capital One</option>
                        <option value="venmo">📱 Venmo</option>
                        <option value="other">📄 Other</option>
                      </select>
                      <span className="text-[10px] text-text-muted">
                        {parsedTransactions.filter(t => (t.flow || 'outflow') === 'outflow' && t.transactionType === 'expense').length} expenses ·
                        {parsedTransactions.filter(t => t.transactionType === 'transfer').length} transfers ·
                        {parsedTransactions.filter(t => (t.flow || 'outflow') === 'inflow').length} inflows
                      </span>
                    </div>
                  </div>
                );
              })()}
              {/* Import warnings banner */}
              {importWarnings && (importWarnings.warnings.length > 0 || importWarnings.dupCount > 0 || importWarnings.doubleChargeCount > 0) && (
                <div className="space-y-2">
                  {importWarnings.warnings.map((w, i) => (
                    <div key={i} className="p-3 rounded-lg bg-negative/10 border border-negative/20 text-sm text-negative flex items-start gap-2">
                      <span>⚠️</span><span>{w}</span>
                    </div>
                  ))}
                  {importWarnings.dupCount > 0 && (
                    <div className="p-3 rounded-lg bg-white/5 border border-glass-border text-sm text-text-secondary flex items-start gap-2">
                      <span>📋</span><span><strong>{importWarnings.dupCount}</strong> already imported — deselected and marked <span className="text-negative">⚠️ ALREADY IMPORTED</span>. Re-select if they're actually new.</span>
                    </div>
                  )}
                  {importWarnings.doubleChargeCount > 0 && (
                    <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-sm text-warning flex items-start gap-2">
                      <span>🔔</span><span><strong>{importWarnings.doubleChargeCount}</strong> possible double charge(s) — same merchant, same amount, same day. Marked <span className="font-semibold">🔔 DOUBLE CHARGE?</span> — worth a look!</span>
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-text-muted">Review categories and tag work expenses. Change the source above if Iris guessed wrong. Fix any categories that are off.</p>
              <div className="glass-card overflow-hidden max-h-[500px] overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-surface-1">
                    <tr className="text-xs text-text-muted uppercase tracking-wider">
                      <th className="p-3 w-8">✓</th>
                      <th className="text-left p-3">Date</th>
                      <th className="text-left p-3">Description</th>
                      <th className="text-left p-3">Type</th>
                      <th className="text-left p-3">Category</th>
                      <th className="text-right p-3">Amount</th>
                      <th className="text-center p-3">Tag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedTransactions.map(t => {
                      const badge = TYPE_BADGES[t.transactionType] || TYPE_BADGES.expense;
                      const isTransfer = t.transactionType === 'transfer' || t.transactionType === 'investment';
                      return (
                        <tr key={t.id} className={`border-t border-glass-border ${t.selected ? (isTransfer ? 'bg-white/[0.01] opacity-50' : 'bg-white/[0.02]') : 'opacity-30'}`}>
                          <td className="p-3">
                            <input type="checkbox" checked={t.selected} onChange={() => toggleSelected(t.id)}
                              className="rounded border-glass-border bg-surface-3 text-accent" />
                          </td>
                          <td className="p-3 text-xs text-text-muted font-mono whitespace-nowrap">{t.date}</td>
                          <td className="p-3">
                            <input type="text" value={t.displayName} onChange={e => updateDisplayName(t.id, e.target.value)}
                              className="bg-transparent border-b border-transparent hover:border-glass-border focus:border-accent/50 text-sm text-text-primary outline-none w-full"
                              title={`Original: ${t.originalDescription}`} />
                            {t.displayName !== t.originalDescription && (
                              <div className="text-[10px] text-text-muted truncate mt-0.5" title={t.originalDescription}>
                                Raw: {t.originalDescription.slice(0, 40)}...
                              </div>
                            )}
                          </td>
                          <td className="p-3">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${badge.color} whitespace-nowrap`}>
                              {t.flow === 'inflow' ? '↑ ' : '↓ '}{badge.label}
                            </span>
                          </td>
                          <td className="p-3">
                            {t.transactionType === 'expense' ? (
                              <select value={t.suggestedCategory} onChange={e => {
                                  if (e.target.value === '__new__') {
                                    setPendingCategoryTarget({ type: 'import', id: t.id });
                                    setShowNewCatForm(true);
                                    e.target.value = t.suggestedCategory; // reset visual
                                    return;
                                  }
                                  updateCategory(t.id, e.target.value as ExpenseCategory);
                                }}
                                className="bg-surface-3 border border-glass-border rounded px-2 py-1 text-xs text-text-primary outline-none">
                                {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
                                <option value="__new__">➕ New Category...</option>
                              </select>
                            ) : <span className="text-xs text-text-muted">—</span>}
                          </td>
                          <td className={`p-3 text-sm text-right font-medium ${t.flow === 'inflow' ? 'text-positive' : 'text-text-primary'}`}>
                            {t.flow === 'inflow' ? '+' : ''}{formatCurrency(t.amount)}
                          </td>
                          <td className="p-3 text-center">
                            {t.transactionType === 'expense' && (
                              <button onClick={() => toggleWork(t.id)}
                                className={`text-xs px-2 py-1 rounded-full transition-colors ${
                                  t.isWorkExpense ? 'bg-warning/15 text-warning' : 'bg-white/5 text-text-muted hover:bg-white/10'
                                }`}>
                                {t.isWorkExpense ? '💼' : '🏠'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">
                  {parsedTransactions.filter(t => t.selected).length} selected ·
                  Personal: {formatCurrency(parsedTransactions.filter(t => t.selected && !t.isWorkExpense).reduce((s, t) => s + t.amount, 0))} ·
                  Work: {formatCurrency(parsedTransactions.filter(t => t.selected && t.isWorkExpense).reduce((s, t) => s + t.amount, 0))}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => { setParsedTransactions([]); setImportWarnings(null); setTab('list'); }}
                    className="px-4 py-2 bg-surface-3 hover:bg-surface-4 rounded-lg text-sm text-text-secondary transition-colors">Cancel</button>
                  <button onClick={() => { setParsedTransactions(prev => prev.map(t => ({ ...t, selected: true }))); setTimeout(() => handleSaveImported(), 100); }}
                    className="px-4 py-2 bg-positive/80 hover:bg-positive rounded-lg text-sm font-medium text-white transition-colors">
                    Quick Import All
                  </button>
                  <button onClick={handleSaveImported}
                    className="px-4 py-2 bg-accent hover:bg-accent-dim rounded-lg text-sm font-medium text-white transition-colors">
                    Save {parsedTransactions.filter(t => t.selected).length} Selected
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <input type="file" ref={fileInputRef} accept=".csv,.txt,.tsv,.xlsx,.xls" multiple className="hidden" onChange={handleFileUpload} />

      {/* New Category Creation Modal */}
      {showNewCatForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => { setShowNewCatForm(false); setPendingCategoryTarget(null); }}>
          <div className="bg-surface-1 border border-glass-border rounded-xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-text-primary mb-4">Create New Category</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-muted mb-1 block">Category Name</label>
                <input
                  type="text"
                  placeholder="e.g., Dog Walker, Gym, Car Wash"
                  value={newCatForm.label}
                  onChange={e => setNewCatForm(f => ({ ...f, label: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateCategory(); }}
                  autoFocus
                  className="w-full bg-surface-2 border border-glass-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">Icon (emoji)</label>
                <input
                  type="text"
                  value={newCatForm.icon}
                  onChange={e => setNewCatForm(f => ({ ...f, icon: e.target.value }))}
                  className="w-20 bg-surface-2 border border-glass-border rounded-lg px-3 py-2 text-sm text-center outline-none focus:border-accent/50"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => { setShowNewCatForm(false); setPendingCategoryTarget(null); }}
                className="flex-1 px-4 py-2 bg-surface-3 hover:bg-surface-4 rounded-lg text-sm text-text-secondary transition-colors"
              >Cancel</button>
              <button
                onClick={handleCreateCategory}
                disabled={!newCatForm.label.trim()}
                className="flex-1 px-4 py-2 bg-accent hover:bg-accent-dim rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-30"
              >Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Classifiers moved to utils/transactionCategorize.ts (shared categorization) ───

function guessWorkExpense(desc: string): boolean {
  const d = desc.toLowerCase();

  // ── International travel = PERSONAL (Dubai/Abu Dhabi vacation) — check FIRST ──
  if (d.includes('dubai') || d.includes('abu dhabi') || d.includes('doha') || d.includes('tawasul') || d.includes('dulsco') || d.includes('teamlab') || d.includes('castore') || d.includes('muhammad afzal') || d.includes('saudi german') || d.includes('alwathba') || d.includes('royal atlantis') || d.includes('w yas island') || d.includes('wyas island') || d.includes('element by westin') || d.includes('boots ') || d.includes('costa auh') || d.includes('sabena coffee') || d.includes('aman taxi') || d.includes('arabia taxi') || d.includes('cars taxi') || d.includes('al salaam') || d.includes('dubai taxi') || d.includes('global village') || d.includes('noqodi') || d.includes('adnh catering') || d.includes('bayt al wakeel') || d.includes('qdf sn boutiques')) return false;

  // ── Fort Lauderdale trip = PERSONAL ──
  if (d.includes('fort lauderdale') || d.includes('pompano beach') || d.includes('coral springs')) return false;

  // Flights (domestic/work)
  if (d.includes('united air') || d.includes('american air') || d.includes('american00') || d.includes('southwes5') || d.includes('delta') || d.includes('southwest') || d.includes('aa admirals') || d.includes('american airlines cent')) return true;
  // Hotels (most domestic = work — Scott can recategorize personal ones like Kona Village)
  if (d.includes('marriott') || d.includes('hilton') || d.includes('hyatt') || d.includes('hotel') || d.includes('residence inn') || d.includes('towneplace') || d.includes('clift royal') || d.includes('sonest') || d.includes('courtyard') || d.includes('aloft ')) return true;
  // Uber trips (generally work — exceptions already caught above)
  if (d.includes('uber *trip')) return true;
  // In-flight wifi
  if (d.includes('panasonic avionics')) return true;
  // Airport / parking
  if (d.includes('dfw park') || d.includes('airport') || d.includes('dfw txmx')) return true;
  // Rental cars
  if (d.includes('avis rent') || d.includes('hertz')) return true;
  return false;
}

// Clean up ugly bank merchant names into something readable
function cleanMerchantName(raw: string): string {
  let clean = raw;
  // Remove common BofA prefixes
  clean = clean.replace(/^(DEBIT CARD PURCHASE|CHECKCARD|POS DEBIT|ACH DEBIT|RECURRING DEBIT|PURCHASE AUTHORIZED ON|DEBIT)\s*/i, '');
  // Remove trailing card numbers (XXXXX1234)
  clean = clean.replace(/\s*X{3,}\d{3,4}\s*/g, ' ');
  // Remove dates embedded in desc
  clean = clean.replace(/\d{2}\/\d{2}\s*/g, '');
  // Remove [Claire] tag we added during Citi parsing (keep for classification, strip for display)
  clean = clean.replace(/\s*\[Claire\]\s*/g, '');
  // Remove city/state suffixes (e.g., "FORT WORTH TX", "SEATTLE WA", "NEW YORK NY")
  clean = clean.replace(/\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)?\s+[A-Z]{2}$/i, '');
  // Remove phone numbers (8005928996, 8007827282)
  clean = clean.replace(/\s*\d{10}\s*/g, ' ');
  // Remove hotel folio/booking cruft (PHONE NUMBER:, FOLIO NUMBER:, ARRIVE:, DEPART:, NAME:)
  clean = clean.replace(/\s*(PHONE NUMBER|FOLIO NUMBER|ARRIVE|DEPART|NAME):.*$/i, '');
  // Remove DES: ACH metadata from BofA
  clean = clean.replace(/\s*DES:.*$/i, '');
  // Remove CO ID: patterns
  clean = clean.replace(/\s*CO ID:.*$/i, '');
  // Remove INDN: patterns
  clean = clean.replace(/\s*INDN:.*$/i, '');
  // Remove ID: patterns from BofA ACH
  clean = clean.replace(/\s*ID:[A-Z0-9]+.*$/i, '');
  // Remove Conf# patterns from Zelle
  clean = clean.replace(/\s*Conf#\s*\S+/i, '');
  // Remove extra whitespace
  clean = clean.replace(/\s+/g, ' ').trim();
  // Capitalize first letter of each word, lowercase rest
  clean = clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  // Cap length
  if (clean.length > 50) clean = clean.slice(0, 50).trim();
  return clean || raw;
}
