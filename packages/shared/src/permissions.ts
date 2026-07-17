export const MailboxType = {
  Personal: 'personal',
  Group: 'group',
  Service: 'service',
  Temp: 'temp',
} as const;

export type MailboxType = (typeof MailboxType)[keyof typeof MailboxType];

export const ThreadStatus = {
  Open: 'open',
  Pending: 'pending',
  Resolved: 'resolved',
  Closed: 'closed',
} as const;

export type ThreadStatus = (typeof ThreadStatus)[keyof typeof ThreadStatus];

export const ThreadPriority = {
  Low: 'low',
  Normal: 'normal',
  High: 'high',
  Urgent: 'urgent',
} as const;

export type ThreadPriority = (typeof ThreadPriority)[keyof typeof ThreadPriority];
