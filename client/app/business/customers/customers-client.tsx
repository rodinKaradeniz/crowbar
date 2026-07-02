"use client";

import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VisitorResponse, ServiceType } from "@/types";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

interface CustomersClientProps {
  visitors: VisitorResponse[];
  serviceTypes: ServiceType[];
  customerSegments?: Record<string, string>;
}

const SEGMENT_STYLES: Record<string, string> = {
  Champions: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "Loyal Customers": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "Potential Loyalists": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "At Risk": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  "Lost Customers": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  Others: "bg-muted text-muted-foreground",
};

const SOURCE_STYLES = {
  reservation: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  walkin: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

const SOURCE_LABELS = {
  reservation: "Reservation",
  walkin: "Walk-in",
};

export default function CustomersClient({
  visitors,
  customerSegments,
}: CustomersClientProps) {
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
    <div className="page-container">
      <div>
        <h1 className="page-title">Customers</h1>
        <p className="page-description">
          Reservation customers and queue walk-ins across your business
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, email, or phone…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            {visitors.length === 0
              ? "No customers yet. They'll appear here once reservations are made or queue walk-ins are seated."
              : "No customers match your search."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
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
                    <span
                      className={cn(
                        "text-xs px-2 py-1 rounded-full font-medium",
                        SOURCE_STYLES[v.source],
                      )}
                    >
                      {SOURCE_LABELS[v.source]}
                    </span>
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
                        {format(parseISO(v.lastVisit), "MMM d, yyyy")}
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
                        <span
                          className={cn(
                            "text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap",
                            SEGMENT_STYLES[customerSegments![v.id]] ||
                              SEGMENT_STYLES.Others,
                          )}
                        >
                          {customerSegments![v.id]}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}

                  <TableCell>
                    {v.source === "reservation" ? (
                      <Link
                        href={`/business/reservations?customer=${v.id}`}
                      >
                        <Button variant="ghost" size="sm" className="text-xs h-7">
                          Reservations <ArrowRight className="ml-1 h-3 w-3" />
                        </Button>
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">Walk-in</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
