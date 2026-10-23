import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC = "holyword:is-public";

/** Marks a route as accessible without a session (catalog, chapters, search, login). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
