import { defineRelations } from "drizzle-orm";

import { models } from "./schema/index.js";

export const relations = defineRelations(models, () => ({}));
