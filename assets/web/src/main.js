/**
 * The page's entry point: pull planks in so its layout primitives
 * define themselves, then register keel's own elements.
 *
 * Light DOM throughout — planks styles through tag-scoped
 * stylesheets injected into `document.head`, which do not pierce a
 * shadow root, and the same is true of `app.css`. That is the same
 * choice the `web-components` stack keel scaffolds makes, for the
 * same reason.
 */

import '/vendor/planks.js';

import { KeelAddForm } from './elements/keel-add-form.js';
import { KeelApp } from './elements/keel-app.js';
import { KeelFileTree } from './elements/keel-file-tree.js';
import { KeelNewForm } from './elements/keel-new-form.js';
import { KeelPlan } from './elements/keel-plan.js';
import { KeelPreset } from './elements/keel-preset.js';
import { KeelQuestionList } from './elements/keel-question-list.js';
import { KeelReview } from './elements/keel-review.js';
import { KeelStepper } from './elements/keel-stepper.js';
import { KeelTargetPicker } from './elements/keel-target-picker.js';

/** Every element the page defines, tag → class. */
const ELEMENTS = {
  'keel-add-form': KeelAddForm,
  'keel-app': KeelApp,
  'keel-file-tree': KeelFileTree,
  'keel-new-form': KeelNewForm,
  'keel-plan': KeelPlan,
  'keel-preset': KeelPreset,
  'keel-question-list': KeelQuestionList,
  'keel-review': KeelReview,
  'keel-stepper': KeelStepper,
  'keel-target-picker': KeelTargetPicker,
};

for (const [tag, element] of Object.entries(ELEMENTS)) {
  if (!customElements.get(tag)) customElements.define(tag, element);
}
