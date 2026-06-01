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
      return { flow: 'inflow', type: 'refund', category: 'other' };
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
  if (d.includes('withdrwl') || d.includes('withdrawal')) return { flow: 'outflow', type: 'expense', category: 'other' };

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

  if (d.includes('marriott') || d.includes('hilton') || d.includes('hyatt') || d.includes('hotel') || d.includes('residence inn') || d.includes('towneplace') || d.includes('clift royal') || d.includes('courtyard') || d.includes('aloft ') || d.includes('kona village') || d.includes('mandalay') || d.includes('admirals club') || d.includes('panasonic avionics')) return 'travel_work';
  if (d.includes('w yas island') || d.includes('wyas island') || d.includes('element by westin') || d.includes('hotelcom') || d.includes('alwathba') || d.includes('royal atlantis')) return 'travel_personal';
  if (d.includes('fll trip advisor') || d.includes('shorepoints') || d.includes('ba inflight') || d.includes('qdf sn boutiques')) return 'travel_work';

  if (d.includes('dicks sporting') || d.includes('academy sport')) return 'kids';
  if (d.includes('tcgplayer') || d.includes('tates comic') || d.includes('dragons hq') || d.includes('kidmania')) return 'kids';
  if (d.includes('my school picture')) return 'kids';

  if (d.includes('tarrant') || d.includes('dmv') || d.includes('mv pymt')) return 'transportation';
  if (d.includes('fort lauderdale airpor') || d.includes('avis rent') || d.includes('hertz') || d.includes('enterprise rent')) return 'travel_work';
  if (d.includes('teamlab') || d.includes('castore') || d.includes('dubai') || d.includes('abu dhabi') || d.includes('tawasul') || d.includes('dulsco') || d.includes('muhammad afzal')) return 'travel_personal';

  if (d.includes('tx birth death') || d.includes('texas.gov')) return 'other';

  return 'other';
}
