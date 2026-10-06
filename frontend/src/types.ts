export type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string | null;
  avatarUrl?: string | null;
};
export type Incident = {
  id: string;
  title: string;
  description?: string;
  category: string;
  subCategory?: string;
  location: string;
  severity: string;
  status: string;
  department?: string;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  slaHours?: number;
  reporter?: string;
  resolvedAt?: string | null;
  commentCount?: number;
};
export type Overview = {
  openIncidents: number;
  slaAtRisk: number;
  breached: number;
  escalated: number;
  resolvedToday: number;
  roomUtilization: number;
  campusHealth: number;
  pendingBookings?: number;
};
export type Trace = {
  traceId: string;
  operation: string;
  startedAt: string;
  completedAt?: string;
  status: string;
  steps: { pattern: string; component: string; result?: string }[];
};
export type EventItem = {
  id: number;
  actor?: string;
  event: string;
  fromStatus?: string;
  toStatus?: string;
  message?: string;
  at: string;
};
export type CommandItem = {
  id: number;
  actor: string;
  action: string;
  created_at: string;
  undone_at?: string | null;
};
export type Notification = {
  id: number;
  title: string;
  message: string;
  read_at?: string | null;
  created_at: string;
  reference_id?: string;
  recipient?: string;
  reference_type?: string | null;
};
export type Booking = {
  id: string;
  room: string;
  start_time: string;
  end_time: string;
  attendees: number;
  purpose: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | string;
  equipment?: string[];
  requesterId?: string | null;
  requesterName?: string;
  decidedByName?: string | null;
  decidedAt?: string | null;
  decisionNote?: string | null;
  approvedClashes?: { id: string; startTime: string; endTime: string }[];
  competingRequests?: string[];
  seriesId?: string | null;
  seriesIndex?: number | null;
  seriesTotal?: number | null;
  seriesPattern?: string | null;
};
export type Occurrence = { startTime: string; endTime: string };
export type OccurrencePreview = Occurrence & { index: number; available: boolean; clashesWith: string[] };
export type Comment = {
  id: number;
  incidentId: string;
  authorId: string;
  authorName: string;
  authorRole: string | null;
  body: string;
  internal: boolean;
  createdAt: string;
  editedAt: string | null;
};
export type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
};
export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  departmentId: string | null;
  department: string | null;
  signIn: string[];
  createdAt: string;
};
export type AIRecommendation = { type: string; priority: string; text: string };
export type DepartmentLoad = { department: string; count: number; percent: number };
export type PatternCatalog = { creational: any[]; structural: any[]; behavioral: any[]; total?: number };

export type Risk = {
  score: number;
  level: 'done' | 'low' | 'elevated' | 'high' | 'breached';
  hoursLeft: number | null;
  reasons: string[];
};
export type RiskMap = Record<string, Risk>;
export type TriageSuggestion = {
  category: string;
  subCategory: string;
  severity: string;
  department: string;
};
export type Triage = {
  suggestion: TriageSuggestion | null;
  confident: boolean;
  confidence?: number;
  reason?: string;
  alternatives?: { category: string; subCategory: string; probability: number }[];
  signals?: { keywords: string[]; severity: string[] };
};
export type SimilarMatch = {
  id: string | null;
  title: string | null;
  status: string;
  location: string;
  similarity: number;
  mine?: boolean;
};
export type Cluster = {
  size: number;
  topic: string;
  ids: string[];
  titles: string[];
  locations: string[];
  maxSeverity: string;
};
export type Insights = {
  brief: { headline: string; bullets: string[] };
  clusters: Cluster[];
  topRisks: { id: string; title: string; status: string; department?: string; risk: Risk }[];
};
export type Trends = {
  days: { date: string; created: number; resolved: number }[];
  byStatus: { label: string; count: number }[];
  byCategory: { label: string; count: number }[];
  bySeverity: { label: string; count: number }[];
  avgResolutionHours: number | null;
};
export type SearchResult = {
  description: string;
  total: number;
  results: { id: string; title: string; status: string; severity: string; location: string }[];
};
export type Attachment = {
  id: number;
  incidentId: string;
  filename: string;
  mime: string;
  size: number;
  uploadedBy?: string;
  createdAt: string;
};
