/**
 * JobRegistry tracks active background import jobs to allow for cancellation.
 */
class JobRegistry {
  constructor() {
    this.activeJobs = new Map(); // siteId -> AbortController
  }

  register(siteId) {
    const controller = new AbortController();
    this.activeJobs.set(siteId, controller);
    return controller.signal;
  }

  cancel(siteId) {
    const controller = this.activeJobs.get(siteId);
    if (controller) {
      controller.abort();
      this.activeJobs.delete(siteId);
      return true;
    }
    return false;
  }

  unregister(siteId) {
    this.activeJobs.delete(siteId);
  }

  isCancelled(siteId) {
    const controller = this.activeJobs.get(siteId);
    return controller ? controller.signal.aborted : false;
  }
}

export const jobRegistry = new JobRegistry();
