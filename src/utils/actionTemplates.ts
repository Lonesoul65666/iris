// Loads ActionTemplate definitions from src/data/actions/*.json.
// Vite imports JSON statically — templates ship with the build.
// Adding a new action category: create category.json, add the import here.

import type { ActionTemplate } from '../types/actions';
import cashTemplates from '../data/actions/cash.json';
import budgetTemplates from '../data/actions/budget.json';
import investmentTemplates from '../data/actions/investment.json';
import taxTemplates from '../data/actions/tax.json';

interface TemplateFile {
  templates: ActionTemplate[];
}

const ALL_FILES: TemplateFile[] = [
  cashTemplates as unknown as TemplateFile,
  budgetTemplates as unknown as TemplateFile,
  investmentTemplates as unknown as TemplateFile,
  taxTemplates as unknown as TemplateFile,
];

export function loadActionTemplates(): ActionTemplate[] {
  return ALL_FILES.flatMap(f => f.templates);
}

export function findTemplate(id: string): ActionTemplate | undefined {
  const all = loadActionTemplates();
  return all.find(t => t.id === id) ?? all.find(t => t.aliases?.includes(id));
}

export function hasTemplate(id: string): boolean {
  return findTemplate(id) !== undefined;
}
