import { Controller, Get, Query } from "@nestjs/common";
import { z } from "zod";
import { ZodValidationPipe } from "../common/zod-body";
import { ContentService, type SearchResponseDto } from "../content/content.service";

const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  versionId: z.string().min(1).optional(),
  scope: z.enum(["version", "all-versions", "topic"]).default("version"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

type SearchQuery = z.infer<typeof searchQuerySchema>;

@Controller("v1/search")
export class SearchController {
  constructor(private readonly content: ContentService) {}

  @Get()
  async search(
    @Query(new ZodValidationPipe(searchQuerySchema)) query: SearchQuery,
  ): Promise<SearchResponseDto> {
    return this.content.search(query.q, query.versionId, query.scope, query.limit);
  }
}
