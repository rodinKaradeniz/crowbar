import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function OverviewLoading() {
  return (
    <div className="p-4 h-[calc(100vh-3rem)] flex flex-col gap-3 overflow-auto">
      {/* Stat cards row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 flex-none">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="border-border/60">
            <CardContent className="p-3">
              <Skeleton className="h-3 w-20 mb-2" />
              <Skeleton className="h-7 w-14 mb-1" />
              <Skeleton className="h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main 3-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[5fr_4fr_minmax(220px,3fr)] gap-3 flex-1 min-h-0">
        {/* Chart card */}
        <Card className="flex flex-col h-full">
          <CardHeader className="pb-2 pt-3 px-3 flex-none">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-36 mt-1" />
          </CardHeader>
          <CardContent className="flex-1 min-h-0 pb-3 px-3">
            <Skeleton className="h-full w-full rounded-md" />
          </CardContent>
        </Card>

        {/* Upcoming reservations */}
        <Card className="flex flex-col h-full">
          <CardHeader className="pb-2 pt-3 px-3 flex-none">
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent className="flex-1 pb-3 px-3 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Staffing hint / forecast */}
        <Card className="h-full">
          <CardHeader className="pb-2 pt-3 px-3">
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="px-3 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
