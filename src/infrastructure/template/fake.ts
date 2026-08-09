/**
 * Canonical fake for the TemplateSource port: template trees and
 * text assets registered in memory. A registered template is a
 * function of the render vars so tests can assert substitution
 * without dragging in a template engine.
 */

import type { ContributionFile } from '../../domain/contract/composition.js';
import type { TemplateSource } from '../../domain/contract/ports/template-source.js';

/** Produces a template tree's files for the given vars. */
export type FakeTemplate = (vars: Readonly<Record<string, unknown>>) => ContributionFile[];

/** TemplateSource fake answering from registered maps. */
export class FakeTemplateSource implements TemplateSource {
  constructor(
    private readonly templates: Readonly<Record<string, FakeTemplate>> = {},
    private readonly texts: Readonly<Record<string, string>> = {},
  ) {}

  render(
    templateId: string,
    targetRoot: string,
    vars: Readonly<Record<string, unknown>>,
  ): Promise<ContributionFile[]> {
    const template = this.templates[templateId];
    if (!template) {
      return Promise.reject(new Error(`FakeTemplateSource: no template '${templateId}'`));
    }
    const prefix = targetRoot === '' ? '' : `${targetRoot.replace(/\/$/, '')}/`;
    return Promise.resolve(template(vars).map((f) => ({ ...f, path: `${prefix}${f.path}` })));
  }

  readText(assetId: string): Promise<string> {
    const text = this.texts[assetId];
    if (text === undefined) {
      return Promise.reject(new Error(`FakeTemplateSource: no text asset '${assetId}'`));
    }
    return Promise.resolve(text);
  }
}
