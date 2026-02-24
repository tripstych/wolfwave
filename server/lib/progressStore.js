/**
 * Simple in-memory store for tracking long-running task progress.
 * Each task has a unique ID and a set of status updates.
 */

const tasks = new Map();

export function createTask(id, initialStatus = 'Initializing...') {
  tasks.set(id, {
    status: initialStatus,
    updatedAt: new Date(),
    steps: [initialStatus]
  });
}

export function updateTask(id, status) {
  const task = tasks.get(id);
  if (task) {
    task.status = status;
    task.updatedAt = new Date();
    task.steps.push(status);
    // Keep only last 10 steps
    if (task.steps.length > 10) task.steps.shift();
  }
}

export function getTask(id) {
  return tasks.get(id);
}

export function completeTask(id) {
  // We keep completed tasks for a short while so the UI can see "Done"
  setTimeout(() => {
    tasks.delete(id);
  }, 30000); // 30 seconds
}

export default { createTask, updateTask, getTask, completeTask };
