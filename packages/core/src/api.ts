import type { components, operations, paths } from "./api/schema";

export type { components, operations, paths };

/** Response/request schemas generated from docs/openapi.yaml. */
export type ApiSchemas = components["schemas"];
export type ApiVersion = ApiSchemas["Version"];
export type ApiChapter = ApiSchemas["Chapter"];
export type ApiVerse = ApiSchemas["Verse"];
export type ApiSearchResponse = ApiSchemas["SearchResponse"];
export type ApiBookmark = ApiSchemas["Bookmark"];
export type ApiHighlight = ApiSchemas["Highlight"];
export type ApiNote = ApiSchemas["Note"];
export type ApiFolder = ApiSchemas["Folder"];
export type ApiReadingPlan = ApiSchemas["ReadingPlan"];
export type ApiPlanProgress = ApiSchemas["PlanProgress"];
export type ApiReadingProgress = ApiSchemas["ReadingProgress"];
export type ApiPreferences = ApiSchemas["Preferences"];
export type ApiPushRequest = ApiSchemas["PushRequest"];
export type ApiPushResponse = ApiSchemas["PushResponse"];
export type ApiPullResponse = ApiSchemas["PullResponse"];
export type ApiDownloadTicket = ApiSchemas["DownloadTicket"];
export type ApiSession = ApiSchemas["Session"];
export type ApiError = ApiSchemas["Error"];

export type ApiPath = keyof paths;
