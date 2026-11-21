import rawRows from "../../data/templates/extended-blueprints.json";
import { AISLES } from "@/lib/catalog/aisles";
import { importWorkbookBlueprints } from "@/lib/catalog/blueprint-workbook";

const imported = importWorkbookBlueprints(rawRows, AISLES);

/** Taxonomy v3 templates. Labels are mapped from the workbook JSON and fail closed on an unknown label. */
export const EXTENDED_BLUEPRINTS = imported.blueprints;

/** Empty unless the workbook has a Size Packs or Industry Packs column. */
export const EXTENDED_BUNDLE_MEMBERSHIP = imported.membership;
