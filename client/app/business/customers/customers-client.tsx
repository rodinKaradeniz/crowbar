"use client";

import { useState, useMemo } from "react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VisitorResponse, ServiceType } from "@/types";
import { Search } from "lucide-react";
import { formatBusinessDate } from "@/lib/business-time";
import { useRegionalSettings } from "@/contexts/regional-context";
import { PageBody, PageHeader } from "@/components/page-header";

interface CustomersClientProps {
  visitors: VisitorResponse[];
  serviceTypes: ServiceType[];
  customerSegments?: Record<string, string>;
  businessTimezone: string;
}

/**
 * Segments and sources used to be five and two coloured pills — green, blue,
 * purple, yellow, red, amber. That is a categorical palette the token file does
 * not declare, and it is a second status object competing with the badge.
 *
 * A guest's segment is NEUTRAL under the rank. How often someone visits has no
 * deadline attached to it at all, and "At Risk" in amber beside a genuinely
 * late booking would make the two look equally urgent. The words carry it.
 */

const SOURCE_LABELS = {
  reservation: "Reservation",
  walkin: "Walk-in",
};

export default function CustomersClient({
  visitors,
  customerSegments,
  businessTimezone,
}: CustomersClientProps) {
  const { locale } = useRegionalSettings();
  const [searchQuery, setSearchQuery] = useState("");

  const hasSegments = customerSegments && Object.keys(customerSegments).length > 0;

  const filtered = useMemo(() => {
    if (!searchQuery) return visitors;
    const q = searchQuery.toLowerCase();
    return visitors.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        (v.email ?? "").toLowerCase().includes(q) ||
        (v.phone ?? "").toLowerCase().includes(q),
    );
  }, [visitors, searchQuery]);

  return (
    <>
      <PageHeader
        wide
        title="Customers"
        description="Reservation customers and queue walk-ins across your business"
      >
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </PageHeader>

      <PageBody wide>
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {visitors.length === 0
                ? "No customers yet. They'll appear here once reservations are made or queue walk-ins are seated."
                : "No customers match your search."}
            </p>
          </div>
        ) : (
          <div className="border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Visits</TableHead>
                  <TableHead>Last Visit</TableHead>
                  <TableHead>Party</TableHead>
                  {hasSegments && <TableHead>Segment</TableHead>}
                  <TableHead className="w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.name}</TableCell>

                    <TableCell>
                      <Badge tone="neutral">{SOURCE_LABELS[v.source]}</Badge>
                    </TableCell>

                    <TableCell>
                      <div className="space-y-0.5">
                        {v.email && (
                          <p className="text-xs text-muted-foreground">{v.email}</p>
                        )}
                        {v.phone && (
                          <p className="text-xs text-muted-foreground">{v.phone}</p>
                        )}
                        {!v.email && !v.phone && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>{v.visitCount}</TableCell>

                    <TableCell>
                      {v.lastVisit ? (
                        <span className="text-sm">
                          {formatBusinessDate(v.lastVisit, businessTimezone, locale)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      {v.partySize != null ? (
                        v.partySize
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {hasSegments && (
                      <TableCell>
                        {customerSegments![v.id] ? (
                          <Badge tone="neutral">{customerSegments![v.id]}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}

                    <TableCell>
                      <Link href={`/business/customers/${v.id}`}>
                        <Button variant="ghost" size="filter" className="text-xs h-7">
                          Profile <ArrowRight className="ml-1 h-3 w-3" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </PageBody>
    </>
  );
}
