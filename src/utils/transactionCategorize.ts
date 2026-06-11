import type { ExpenseCategory, TransactionFlow, TransactionType } from '../types/budget';

/**
 * Categorization rules for bank + credit card transactions.
 * Tuned to Scott & Claire's actual merchants (HEB, Abnormal payroll, etc.).
 * When transaction rules UI ships, these become the seed defaults — users can override
 * or add their own via merchantRules store.
 *
 * Extracted from ExpenseManager.tsx so services (future connector syncs, SMS/email
 * imports) can reuse without pulling in the React component graph.
 */

export function classifyBankTransaction(
  desc: string,
  amount: number,
): { flow: TransactionFlow; type: TransactionType; category: ExpenseCategory } {
  const d = desc.toLowerCase();

  // ── INFLOWS (positive amounts) ──
  if (amount > 0) {
    if (d.includes('abnormal sec-osv') || (d.includes('abnormal sec') && d.includes('payroll'))) {
      return { flow: 'inflow', type: 'income', category: 'other' };
    }
    if (d.includes('abnormal ai') && (d.includes('tmate') || d.includes('coupa'))) {
      return { flow: 'inflow', type: 'reimbursement', category: 'other' };
    }
    if (d.includes('online banking transfer from') || d.includes('transfer from sav') || d.includes('transfer from chk') || d.includes('xfer from')) {
      return { flow: 'inflow', type: 'transfer', category: 'other' };
    }
    if (d.includes('payment thank you') || d.includes('autopay payment') || d.includes('online payment')) {
      return { flow: 'inflow', type: 'transfer', category: 'other' };
    }
    if (d.includes('zelle payment from')) {
      return { flow: 'inflow', type: 'income', category: 'other' };
    }
    if (d.includes('preferred rewards') && d.includes('rebate')) {
      return { flow: 'inflow', type: 'refund', category: 'other' };
    }
    if (d.includes('refund') || d.includes('credit') || d.includes('return')) {
      // Categorize the refund against the merchant it refunds (run the outflow
      // merchant rules on the same description) so it nets out of the right
      // bucket — an Amazon return should credit Amazon, not vanish into 'other'.
      const { category } = classifyBankTransaction(desc, -Math.abs(amount) - 1);
      return { flow: 'inflow', type: 'refund', category };
    }
    return { flow: 'inflow', type: 'income', category: 'other' };
  }

  // ── OUTFLOWS ──
  if (d.includes('citi') && (d.includes('payment') || d.includes('pmt') || d.includes('autopay') || d.includes('pymt'))) return { flow: 'outflow', type: 'transfer', category: 'other' };
  if (d.includes('capital one') && (d.includes('pmt') || d.includes('payment') || d.includes('autopay') || d.includes('pymt'))) return { flow: 'outflow', type: 'transfer', category: 'other' };
  if (d.includes('chase') && (d.includes('payment') || d.includes('pmt') || d.includes('autopay'))) return { flow: 'outflow', type: 'transfer', category: 'other' };
  if (d.includes('ba electronic') && d.includes('payment')) return { flow: 'outflow', type: 'transfer', category: 'other' };
  if (d.includes('card payment') || d.includes('card pmt') || d.includes('cardmember') || d.includes('autopay payment')) return { flow: 'outflow', type: 'transfer', category: 'other' };

  if (d.includes('fid bkg svc') && d.includes('moneyline')) return { flow: 'outflow', type: 'investment', category: 'investing' };
  if (d.includes('fidelity') && (d.includes('transfer') || d.includes('contrib'))) return { flow: 'outflow', type: 'investment', category: 'investing' };
  if (d.includes('coinbase')) return { flow: 'outflow', type: 'investment', category: 'investing' };
  if (d.includes('wealthfront') || d.includes('betterment') || d.includes('schwab') || d.includes('vanguard')) return { flow: 'outflow', type: 'investment', category: 'investing' };

  if (d.includes('online banking transfer to')) return { flow: 'outflow', type: 'transfer', category: 'other' };
  if (d.includes('transfer to sav') || d.includes('transfer to chk') || d.includes('xfer to')) return { flow: 'outflow', type: 'transfer', category: 'other' };
  if (d.includes('keepthechange') || (d.includes('recurring transfer') && d.includes('to'))) return { flow: 'outflow', type: 'transfer', category: 'other' };

  if (d.includes('wf home mtg') || (d.includes('wells fargo') && d.includes('mortgage'))) return { flow: 'outflow', type: 'expense', category: 'housing' };

  if (d.includes('just energy')) return { flow: 'outflow', type: 'expense', category: 'utilities' };
  if (d.includes('city of fort wor') && d.includes('billpay')) return { flow: 'outflow', type: 'expense', category: 'utilities' };
  if (d.includes('verizon wireless')) return { flow: 'outflow', type: 'expense', category: 'utilities' };

  if (d.includes('venmo')) return { flow: 'outflow', type: 'expense', category: 'personal' };
  if (d.includes('zelle payment to')) return { flow: 'outflow', type: 'expense', category: 'other' };
  if (d.includes('withdrwl') || d.includes('withdrawal')) return { flow: 'outflow', type: 'expense', category: 'personal' }; // ATM/cash → personal (was 'other')

  if (d.includes('residence inn') || d.includes('marriott') || d.includes('hilton') || d.includes('hyatt') || d.includes('hotel')) {
    const isInternational = d.includes('dubai') || d.includes('abu dhabi') || d.includes('doha') || d.includes('london');
    const isFLL = d.includes('pompano beach') || d.includes('fort lauderdale') || d.includes('coral springs');
    return { flow: 'outflow', type: 'expense', category: (isInternational || isFLL) ? 'travel_personal' : 'travel_work' };
  }

  return { flow: 'outflow', type: 'expense', category: guessCategory(desc) };
}

export function guessCategory(desc: string): ExpenseCategory {
  const d = desc.toLowerCase();

  if (d.includes('amazon') || d.includes('amzn') || d.includes('prime now')) return 'amazon';

  if (d.includes('irs') || d.includes('internal revenue') || d.includes('tax payment') || d.includes('estimated tax') || d.includes('h&r block') || d.includes('turbotax')) return 'taxes';

  if (d.includes('h-e-b') || d.includes('heb ') || d.includes('heb curbside') || d.includes('kroger') || d.includes('walmart.com') || d.includes('walmart sup') || d.includes('costco') || d.includes("sam's") || d.includes('aldi') || d.includes('whole foods') || d.includes('tom thumb') || d.includes('target') || d.includes('instacart')) return 'food_groceries';

  if (d.includes('starbucks')) return 'food_dining';
  if (d.includes('uber *eats') || d.includes('uber eats')) return 'food_dining';
  if (d.includes('doordash') || d.includes('grubhub')) return 'food_dining';
  if (d.includes('mcdonald') || d.includes('chick-fil') || d.includes('whataburger') || d.includes('freebirds') || d.includes('red robin') || d.includes('pappasitos') || d.includes('pappadeaux') || d.includes('hopdoddy') || d.includes('chipotle') || d.includes('panera') || d.includes('sonic') || d.includes('wendy') || d.includes('pizza') || d.includes('little brothers') || d.includes('taco') || d.includes('ramen') || d.includes('diner') || d.includes('cantina') || d.includes('grill') || d.includes('bbq') || d.includes('cafe') || d.includes('café') || d.includes('restaurant') || d.includes('lounge') || d.includes('perrys') || d.includes('bell tower') || d.includes('pinecrest') || d.includes('popeyes') || d.includes('coco shrimp') || d.includes('mcalisters') || d.includes('shipley') || d.includes('rock & brew') || d.includes('p.f.chang') || d.includes('brew') || d.includes('tap 42') || d.includes('gigi') || d.includes('einstein')) return 'food_dining';
  if (d.includes("chili's") || d.includes('dfw chili') || d.includes('veranda') || d.includes('uchiko') || d.includes('west coast sourdo') || d.includes('magpie') || d.includes('cheddar') || d.includes('dfw txmx') || d.includes('mc gee') || d.includes('donut party') || d.includes('hash kitchen') || d.includes('ljs ') || d.includes('burger fi') || d.includes('rumours bar') || d.includes('costa ') || d.includes('sabena coffee') || d.includes('bayt al wakeel') || d.includes('adnh catering')) return 'food_dining';

  if (d.includes('primrose school')) return 'childcare';
  if (d.includes('py northwest') || d.includes('py *northwest') || d.includes('py nw')) return 'childcare';
  if (d.includes('northwest isd')) return 'kids';
  if (d.includes('care.com')) return 'childcare';

  if (d.includes('exxon') || d.includes('shell oil') || d.includes('chevron') || d.includes('buc-ee') || d.includes('racetrac') || d.includes('quiktrip') || d.includes('fuel')) return 'transportation';
  if (d.includes('hctra') || d.includes('ez tag') || d.includes('ntta') || d.includes('tolltag')) return 'transportation';
  if (d.includes('uber *trip') || (d.includes('uber') && !d.includes('eats'))) return 'transportation';
  if (d.includes('lyft')) return 'transportation';
  if (d.includes('curb ') || d.includes('taxi') || d.includes('cab ')) return 'transportation';
  if (d.includes('parkwhiz') || d.includes('dfw park')) return 'transportation';
  if (d.includes('cars taxi') || d.includes('arabia taxi') || d.includes('dubai taxi') || d.includes('al salaam') || d.includes('aman taxi') || d.includes('sofi transportatio')) return 'transportation';

  if (d.includes('netflix') || d.includes('hulu') || d.includes('disney') || d.includes('spotify') || d.includes('youtube') || d.includes('hbomax') || d.includes('help.hbomax') || d.includes('peacock') || d.includes('paramount')) return 'subscriptions';
  if (d.includes('apple.com/bill') || d.includes('apple.com')) return 'subscriptions';
  if (d.includes('microsoft*xbox') || d.includes('xbox game pa') || d.includes('microsoft*microsoft 36') || d.includes('microsoft*store')) return 'subscriptions';
  if (d.includes('openai') || d.includes('chatgpt')) return 'subscriptions';
  if (d.includes('google *') && (d.includes('one') || d.includes('monarch') || d.includes('pokemon') || d.includes('suno') || d.includes('feral') || d.includes('collectr'))) return 'subscriptions';
  if (d.includes('xsolla*pokemon')) return 'subscriptions';
  if (d.includes('oculus')) return 'subscriptions';
  if (d.includes('intuit') || d.includes('turbotax')) return 'subscriptions';
  if (d.includes('playstation')) return 'subscriptions';
  if (d.includes('iracing')) return 'subscriptions';
  if (d.includes('keeper passw')) return 'subscriptions';
  if (d.includes('goodbundle')) return 'subscriptions';
  if (d.includes('clear *clearme') || d.includes('clearme')) return 'subscriptions';
  if (d.includes('amazon prime') || d.includes('amazon digit')) return 'subscriptions';
  if (d.includes('wplus') || d.includes('wmt plus')) return 'subscriptions';
  if (d.includes('sp julep')) return 'subscriptions';
  if (d.includes('www.use.ai')) return 'subscriptions';
  if (d.includes('wework')) return 'subscriptions';

  if (d.includes('texashealth') || d.includes('hand and wrist') || d.includes('pharmacy') || d.includes('cvs') || d.includes('walgreen') || d.includes('doctor') || d.includes('medical') || d.includes('dental') || d.includes('optom') || d.includes('texas digestive') || d.includes("america's best") || d.includes('honeydew care') || d.includes('behance beauty med') || d.includes('saudi german') || d.includes('boots ') || d.includes('alivemoment')) return 'healthcare';

  if (d.includes('state farm') || d.includes('allstate') || d.includes('geico') || d.includes('progressive') || d.includes('insurance') || d.includes('allianz travel')) return 'insurance';

  if (d.includes('autozone') || d.includes("o'reilly") || d.includes('jiffy') || d.includes('discount tire') || d.includes('links car wash') || d.includes('car wash') || d.includes('whitewater car wash') || d.includes('tommys express')) return 'car_maintenance';

  if (d.includes('home depot') || d.includes('lowe') || d.includes('menard') || d.includes('aptive environmental') || d.includes('safe and sound garage') || d.includes('agaserviceco')) return 'home_maintenance';

  if (d.includes('att*bill') || d.includes('att ') || d.includes('at&t')) return 'utilities';
  if (d.includes('just energy') || d.includes('atmos energy') || d.includes('verizon') || d.includes('t-mobile') || d.includes('city of fort wor')) return 'utilities';

  if (d.includes('stitch fix') || d.includes('thredup') || d.includes('dsw ') || d.includes('ulta') || d.includes('five below') || d.includes('blonded by erica') || d.includes('cinch cleaners') || d.includes('sp goodr') || d.includes('sp treluxia')) return 'clothing';

  if (d.includes('specs wine') || d.includes('total wine') || d.includes('liquor') || d.includes('wine ') || d.includes('beer ')) return 'alcohol';

  if (d.includes('save the children') || d.includes('aspca') || d.includes('donation') || d.includes('charity')) return 'charity';

  if (d.includes('seatgeek') || d.includes('stubhub') || d.includes('ticketmaster')) return 'fun_scott';
  if (d.includes('amc ') || d.includes('cinemark') || d.includes('movie') || d.includes('dubai miracle garden') || d.includes('global village') || d.includes('noqodi')) return 'entertainment';

  if (d.includes('best buy') || d.includes('micro center') || d.includes('b&h photo')) return 'electronics';

  if (d.includes('amazon') || d.includes('amzn')) return 'amazon';

  if (d.includes('7-eleven') && !d.includes('exxon')) return 'food_dining';

  if (d.includes('american00') || d.includes('southwes5') || d.includes('united00') || d.includes('delta00') || d.includes('american airlines')) return 'travel_work';

  if (d.includes('marriott') || d.includes('hilton') || d.includes('hyatt') || d.includes('hotel') || d.includes('residence inn') || d.includes('towneplace') || d.includes('clift royal') || d.includes('courtyard') || d.includes('aloft ') || d.includes('mandalay') || d.includes('admirals club') || d.includes('panasonic avionics')) return 'travel_work';
  // Hawaii = the family vacation (Kona/Kailua) — personal, NOT work. (Fixes the Kona Village mislabel.)
  if (d.includes('w yas island') || d.includes('wyas island') || d.includes('element by westin') || d.includes('hotelcom') || d.includes('alwathba') || d.includes('royal atlantis') || d.includes('kona') || d.includes('kailua') || d.includes('kealakekua')) return 'travel_personal';
  if (d.includes('fll trip advisor') || d.includes('shorepoints') || d.includes('ba inflight') || d.includes('qdf sn boutiques')) return 'travel_work';

  if (d.includes('dicks sporting') || d.includes('academy sport')) return 'kids';
  if (d.includes('tcgplayer') || d.includes('tates comic') || d.includes('dragons hq') || d.includes('kidmania')) return 'kids';
  if (d.includes('my school picture')) return 'kids';

  if (d.includes('tarrant') || d.includes('dmv') || d.includes('mv pymt')) return 'transportation';
  if (d.includes('fort lauderdale airpor') || d.includes('avis rent') || d.includes('hertz') || d.includes('enterprise rent')) return 'travel_work';
  if (d.includes('teamlab') || d.includes('castore') || d.includes('dubai') || d.includes('abu dhabi') || d.includes('tawasul') || d.includes('dulsco') || d.includes('muhammad afzal')) return 'travel_personal';

  if (d.includes('tx birth death') || d.includes('texas.gov')) return 'other';

  // ── 2026-06-08 pass: merchants that were falling through to 'other' ──
  // Taxes
  if (d.includes('us treasury') || d.includes('treasury pmnt') || d.includes('treasury serv')) return 'taxes';
  // Insurance
  if (d.includes('liberty mutual')) return 'insurance';
  // Phone / utilities
  if (d.includes('vz wireless') || d.includes('vzw webpay') || d.includes('vzw ')) return 'utilities';
  // Healthcare — clinics, docs, dental, OBGYN
  if (d.includes('brennan md') || d.includes(' md ') || d.includes('nextcare') || d.includes('urgentcare') || d.includes('urgent care') || d.includes('obgyn') || d.includes('preschool smiles') || d.includes('dental') || d.includes('orthodont')) return 'healthcare';
  // Pool & home services
  if (d.includes('pool') || d.includes("leslie's") || d.includes('emerald pool')) return 'home_maintenance';
  // Auto service / dealership / state inspection
  if (d.includes('cadillac') || d.includes('acura') || d.includes('sewell') || d.includes('hiley') || d.includes('state inspecti')) return 'car_maintenance';
  // Gas / convenience fuel
  if (d.includes('conoco') || d.includes('kwik stop') || /\bqt \d/.test(d)) return 'transportation';
  // Hotels / airlines / airport / rental not caught above
  if (d.includes('sheraton') || d.includes('motel') || d.includes('westin') || d.includes('sonesta') || d.includes('mbay front desk') || d.includes('front desk')) return 'travel_work';
  if (d.includes('etihad') || d.includes('avis') || d.includes('airport') || d.includes('admirals') || d.includes('aa wifi') || d.includes('crowns lax') || d.includes('lax airp') || d.includes('dnc boise') || d.includes('msp hudson') || d.includes('ampersand air') || d.includes('cvg gaslight') || d.includes('phx 12 news')) return 'travel_work';
  // Salons / nails / tanning / personal care
  if (d.includes('nail') || d.includes('salon') || d.includes('palm beach tan') || d.includes('beachwaver')) return 'personal';
  // Clothing / dept stores
  if (d.includes('ross stores') || d.includes('nordstrom') || d.includes('printerval')) return 'clothing';
  // Kids / games / hobby / school
  if (d.includes('urban air') || d.includes('dallascardshow') || d.includes('lazarus games') || d.includes('yearbook') || d.includes('nintendo') || d.includes('school picture') || d.includes('crystal orbs')) return 'kids';
  // Entertainment / outings
  if (d.includes('concert merch') || d.includes('tcu concession') || d.includes('choctaw') || d.includes('durant resort')) return 'entertainment';
  // Crafts / outdoors retail
  if (d.includes('hobby lobby') || d.includes('bass pro')) return 'personal';
  // Smoke shop
  if (d.includes('smoke shop')) return 'personal';
  // Restaurants / bars that slipped through (Toast 'TST*' POS catches many)
  if (
    d.includes('tst*') || d.includes('tst ') || d.includes('resort food') || d.includes('steakho') ||
    d.includes('brunch') || d.includes('hibachi') || d.includes('razzoo') || d.includes('sickies') ||
    d.includes('pei wei') || d.includes('mooyah') || d.includes('kekes') || d.includes("domino") ||
    d.includes('irish pub') || d.includes("friday's") || d.includes('waffle house') || d.includes('us egg') ||
    d.includes('truck yard') || d.includes("jason's deli") || d.includes('taste of louisiana') ||
    d.includes('great american cookies') || d.includes('sushi') || d.includes('two rows') ||
    d.includes('hyderabad') || d.includes('freddys') || d.includes('son of a butcher') || d.includes('hg sply') ||
    d.includes('bennett groc') || d.includes('firehouse subs') || d.includes('jack in the box') ||
    d.includes('donut') || d.includes('mooyah') || d.includes('jason') || d.includes('pho ') ||
    d.includes('grill') || d.includes('kitchen') || d.includes('eatery') || d.includes('bistro')
  ) return 'food_dining';

  // Misc app subscriptions
  if (d.includes('anygo') || d.includes('google *any')) return 'subscriptions';
  // Credit-card interest → debt
  if (d.includes('interest charge')) return 'debt';
  // Broader subscriptions (Microsoft variants, Prime Video)
  if (d.includes('microsoft*') || d.includes('msbill.info') || d.includes('prime video')) return 'subscriptions';
  // More groceries
  if (d.includes('albertsons') || d.includes('pavilions') || d.includes('pavillions') || d.includes('sprouts') || d.includes('trader joe')) return 'food_groceries';
  // More gas / transit
  if (d.includes('circlek') || d.includes('circle k') || d.includes('dart go pass') || d.includes('valero') || d.includes('murphy')) return 'transportation';
  // In-flight wifi → travel
  if (d.includes('inflight') || d.includes('wifionboard') || d.includes('wifi onboard')) return 'travel_work';
  // More dining
  if (d.includes('dairy queen') || d.includes("captain d") || d.includes('slappys') || d.includes('dunkin') || d.includes('subway')) return 'food_dining';
  // Games / kids
  if (d.includes('gamestop')) return 'kids';
  // Car wash
  if (d.includes('cleansmart') || d.includes('car wash')) return 'car_maintenance';
  // Personal care / beauty
  if (d.includes('brows') || d.includes('threading') || d.includes('spoiledchild') || d.includes('lash ')) return 'personal';
  // Online marketplaces (mixed retail, like Amazon) → personal
  if (d.includes('temu') || d.includes('shein') || d.includes('aliexpress')) return 'personal';
  // Hotels (Marriott brands)
  if (d.includes('renaissance')) return 'travel_work';
  // Government service fees stay 'other'
  if (d.includes('tx.gov') || d.includes('txdps') || d.includes('servicefee')) return 'other';

  return 'other';
}
