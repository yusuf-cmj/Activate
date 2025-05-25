"use client"

import { IconUsers, IconCircleCheck, IconCircleX, IconClockHour4 } from "@tabler/icons-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { UserStatus } from "@/app/page"; // app/page.tsx'den UserStatus interface'ini import ediyoruz

interface SectionCardsProps {
  userStatuses: UserStatus[];
  isLoading: boolean;
  error: string | null;
}

export function SectionCards({ userStatuses, isLoading, error }: SectionCardsProps) {
  if (isLoading) {
  return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 @[1200px]:grid-cols-3 px-4 lg:px-6">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-6 w-6 rounded-full" />
        </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mt-1" />
              <Skeleton className="h-4 w-40 mt-2" />
            </CardContent>
          </Card>
        ))}
          </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 lg:px-6">
        <Card className="bg-destructive/10 border-destructive">
        <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
        </CardHeader>
          <CardContent>
            <p>Could not load user data: {error}</p>
          </CardContent>
      </Card>
          </div>
    );
  }

  const totalUsers = userStatuses.length;
  const activeUsers = userStatuses.filter(status => status.presence === 'active').length;
  const awayUsers = userStatuses.filter(status => status.presence === 'away').length;
  // Dördüncü kart için bir metrik düşünülmediğinden şimdilik 3 kart gösteriyoruz.

  const cardData = [
    {
      title: "Total Users",
      value: totalUsers.toString(),
      icon: IconUsers,
      description: "Total users in the workspace.",
    },
    {
      title: "Active Users",
      value: activeUsers.toString(),
      icon: IconCircleCheck, // Aktifliği temsil eden bir ikon
      description: "Users currently active.",
    },
    {
      title: "Away Users",
      value: awayUsers.toString(),
      icon: IconClockHour4, // Away durumunu temsil eden bir ikon (veya IconCircleX)
      description: "Users currently set to away.",
    },
    // Dördüncü kartı kaldırdık
    // {
    //   title: "Pending Invitations",
    //   value: "3",
    //   icon: IconMailForward, 
    //   description: "Users invited but not yet joined.",
    // },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 @[1200px]:grid-cols-3 px-4 lg:px-6">
      {cardData.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <card.icon className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            {card.description && (
              <p className="text-xs text-muted-foreground">
                {card.description}
              </p>
            )}
          </CardContent>
      </Card>
      ))}
    </div>
  )
}
