// @ts-nocheck
import * as __fd_glob_16 from "../content/docs/general/faq.mdx?collection=docs"
import * as __fd_glob_15 from "../content/docs/general/contact-support.mdx?collection=docs"
import * as __fd_glob_14 from "../content/docs/customers/managing-reservations.mdx?collection=docs"
import * as __fd_glob_13 from "../content/docs/customers/making-a-reservation.mdx?collection=docs"
import * as __fd_glob_12 from "../content/docs/customers/getting-started.mdx?collection=docs"
import * as __fd_glob_11 from "../content/docs/customers/account-settings.mdx?collection=docs"
import * as __fd_glob_10 from "../content/docs/businesses/staff-management.mdx?collection=docs"
import * as __fd_glob_9 from "../content/docs/businesses/managing-services.mdx?collection=docs"
import * as __fd_glob_8 from "../content/docs/businesses/insights.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/businesses/handling-reservations.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/businesses/getting-started.mdx?collection=docs"
import * as __fd_glob_5 from "../content/docs/businesses/analytics.mdx?collection=docs"
import * as __fd_glob_4 from "../content/docs/index.mdx?collection=docs"
import { default as __fd_glob_3 } from "../content/docs/customers/meta.json?collection=docs"
import { default as __fd_glob_2 } from "../content/docs/general/meta.json?collection=docs"
import { default as __fd_glob_1 } from "../content/docs/businesses/meta.json?collection=docs"
import { default as __fd_glob_0 } from "../content/docs/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_0, "businesses/meta.json": __fd_glob_1, "general/meta.json": __fd_glob_2, "customers/meta.json": __fd_glob_3, }, {"index.mdx": __fd_glob_4, "businesses/analytics.mdx": __fd_glob_5, "businesses/getting-started.mdx": __fd_glob_6, "businesses/handling-reservations.mdx": __fd_glob_7, "businesses/insights.mdx": __fd_glob_8, "businesses/managing-services.mdx": __fd_glob_9, "businesses/staff-management.mdx": __fd_glob_10, "customers/account-settings.mdx": __fd_glob_11, "customers/getting-started.mdx": __fd_glob_12, "customers/making-a-reservation.mdx": __fd_glob_13, "customers/managing-reservations.mdx": __fd_glob_14, "general/contact-support.mdx": __fd_glob_15, "general/faq.mdx": __fd_glob_16, });