import type {
  Department,
  Task,
  TaskAssignee,
  TaskProject,
  TaskStatus,
  User,
} from '@prisma/client';

export type TaskWithRelations = Task & {
  project?: TaskProject | null;
  department?: Department | null;
  createdBy?: Partial<User> | null;
  assignees?: (TaskAssignee & { user?: Partial<User> | null })[];
};

export interface TaskListResponse {
  items: TaskWithRelations[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TaskBoardColumn {
  count: number;
  items: TaskWithRelations[];
}

export type TaskBoardResponse = Record<TaskStatus, TaskBoardColumn> & {
  total: number;
};

export interface TaskCalendarResponse {
  items: TaskWithRelations[];
  total: number;
}

export interface TaskReorderResponse {
  success: boolean;
  updatedCount: number;
}

export interface TaskDeleteResponse {
  success: boolean;
  id: string;
}
