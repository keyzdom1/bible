import { Module } from "@nestjs/common";
import { PlansController } from "./plans.controller";
import { PreferencesController, ReadingProgressController } from "./progress.controller";
import {
  BookmarksController,
  FoldersController,
  HighlightsController,
  NotesController,
} from "./study.controllers";
import { StudyService } from "./study.service";

@Module({
  controllers: [
    BookmarksController,
    HighlightsController,
    NotesController,
    FoldersController,
    PlansController,
    ReadingProgressController,
    PreferencesController,
  ],
  providers: [StudyService],
})
export class StudyModule {}
