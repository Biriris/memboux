import type { Locale } from "./i18n";

export const weddingMenuCourseTypes = [
  "welcome",
  "starter",
  "salad",
  "main",
  "dessert",
  "drinks",
  "late_night",
  "custom",
] as const;

export type WeddingMenuCourseType = (typeof weddingMenuCourseTypes)[number];

export type WeddingMenuCourseRow = {
  id: string;
  event_id: string;
  course_type: WeddingMenuCourseType;
  title: string;
  description: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
};

const labels: Record<WeddingMenuCourseType, Record<"el" | "en", string>> = {
  welcome: { el: "Καλωσόρισμα", en: "Welcome" },
  starter: { el: "Ορεκτικό", en: "Starter" },
  salad: { el: "Σαλάτα", en: "Salad" },
  main: { el: "Κυρίως", en: "Main course" },
  dessert: { el: "Γλυκό", en: "Dessert" },
  drinks: { el: "Ποτά", en: "Drinks" },
  late_night: { el: "Late-night", en: "Late-night" },
  custom: { el: "Άλλο", en: "Other" },
};

export function isWeddingMenuCourseType(value: unknown): value is WeddingMenuCourseType {
  return weddingMenuCourseTypes.includes(String(value) as WeddingMenuCourseType);
}

export function weddingMenuCourseLabel(type: WeddingMenuCourseType, locale: Locale) {
  return labels[type][locale === "el" ? "el" : "en"];
}

export function sortWeddingMenuCourses(courses: readonly WeddingMenuCourseRow[]) {
  const typeOrder = new Map(weddingMenuCourseTypes.map((type, index) => [type, index]));
  return [...courses].sort((left, right) =>
    (typeOrder.get(left.course_type) ?? weddingMenuCourseTypes.length) - (typeOrder.get(right.course_type) ?? weddingMenuCourseTypes.length)
    || left.sort_order - right.sort_order
    || left.id.localeCompare(right.id));
}

export function groupWeddingMenuCourses(courses: readonly WeddingMenuCourseRow[]) {
  const sorted = sortWeddingMenuCourses(courses);
  return weddingMenuCourseTypes.map((type) => ({
    type,
    courses: sorted.filter((course) => course.course_type === type),
  })).filter((group) => group.courses.length > 0);
}
