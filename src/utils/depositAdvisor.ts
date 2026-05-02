/**
 * @deprecated This module has been renamed to `nextDeploymentBrief`. This shim
 * preserves backwards compat for any still-importing callers; please migrate
 * to the new module.
 */

export {
  generateNextDeploymentBrief,
  generateDepositPlan,
  type NextDeploymentBrief,
  type DepositPlan,
  type DeploymentStep,
  type DepositRecommendation,
} from './nextDeploymentBrief';
