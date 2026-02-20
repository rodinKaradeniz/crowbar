// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"index.mdx": () => import("../content/docs/index.mdx?collection=docs"), "businesses/analytics.mdx": () => import("../content/docs/businesses/analytics.mdx?collection=docs"), "businesses/getting-started.mdx": () => import("../content/docs/businesses/getting-started.mdx?collection=docs"), "businesses/handling-reservations.mdx": () => import("../content/docs/businesses/handling-reservations.mdx?collection=docs"), "businesses/insights.mdx": () => import("../content/docs/businesses/insights.mdx?collection=docs"), "businesses/managing-services.mdx": () => import("../content/docs/businesses/managing-services.mdx?collection=docs"), "businesses/staff-management.mdx": () => import("../content/docs/businesses/staff-management.mdx?collection=docs"), "customers/account-settings.mdx": () => import("../content/docs/customers/account-settings.mdx?collection=docs"), "customers/getting-started.mdx": () => import("../content/docs/customers/getting-started.mdx?collection=docs"), "customers/making-a-reservation.mdx": () => import("../content/docs/customers/making-a-reservation.mdx?collection=docs"), "customers/managing-reservations.mdx": () => import("../content/docs/customers/managing-reservations.mdx?collection=docs"), "general/contact-support.mdx": () => import("../content/docs/general/contact-support.mdx?collection=docs"), "general/faq.mdx": () => import("../content/docs/general/faq.mdx?collection=docs"), }),
};
export default browserCollections;