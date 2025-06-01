"use client";

import React from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; // Shadcn/ui tooltip
import { formatDuration } from "@/lib/activityUtils"; // Süre formatlama için

export interface HeatmapData {
  date: string; // YYYY-MM-DD
  count: number; // Aktivite seviyesi (0-4 gibi bir aralıkta olabilir, renklendirme için)
  totalActiveMs: number; // O günkü toplam aktif milisaniye
}

interface ActivityHeatmapProps {
  data: HeatmapData[]; // Artık bu, gösterilecek tüm günleri içerecek (boş günler dahil)
  // numDays, startDate, endDate propları kaldırıldı veya opsiyonel hale getirildi.
}

// Helper to get month name
const getMonthName = (monthIndex: number): string => {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return monthNames[monthIndex] || "";
}

const ActivityHeatmap: React.FC<ActivityHeatmapProps> = ({ data }) => {
  // data prop'unun zaten gösterilecek tüm günleri içerdiğini varsayıyoruz.
  // app/users/[userId]/page.tsx bu veriyi bu şekilde hazırlamalı.

  if (!data || data.length === 0) {
    return <div className="text-center p-4">No activity data to display.</div>;
  }

  // Günleri haftalara göre gruplandır
  const weeks: HeatmapData[][] = [];
  let currentWeek: HeatmapData[] = [];

  // İlk günün haftanın hangi günü olduğunu bulup boşlukları ekle
  const firstDayObject = new Date(data[0].date + "T00:00:00"); 
  const firstDayOfWeek = firstDayObject.getDay(); // 0 (Pazar) - 6 (Cumartesi)

  for (let i = 0; i < firstDayOfWeek; i++) {
    currentWeek.push({ date: `placeholder-start-${i}`, count: -1, totalActiveMs: -1 });
  }

  data.forEach((dayData) => {
    currentWeek.push(dayData);
    if (currentWeek.length === 7) {
      weeks.push([...currentWeek]);
      currentWeek = [];
    }
  });
  // Son, tamamlanmamış haftayı da ekle (eğer varsa)
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push({ date: `placeholder-end-${currentWeek.length}`, count: -1, totalActiveMs: -1 });
    }
    weeks.push([...currentWeek]);
  }
  
  // Renk skalası için (count değerine göre)
  const getColor = (count: number, totalActiveMs: number) => {
    if (count === -1) return "bg-transparent"; // Placeholder için

    const hours = totalActiveMs / (1000 * 60 * 60);

    if (hours <= 0) return "bg-gray-200 dark:bg-gray-700";         // 0 saat
    if (hours <= 2) return "bg-green-200 dark:bg-green-900";       // >0 - 2 saat (En açık yeşil)
    if (hours <= 4) return "bg-green-400 dark:bg-green-700";       // >2 - 4 saat (Yeşil)
    if (hours <= 6) return "bg-green-600 dark:bg-green-500";       // >4 - 6 saat (Biraz koyu yeşil)
    if (hours < 8) return "bg-green-700 dark:bg-green-400";        // >6 - 8 saat (Daha koyu yeşil) 
    return "bg-green-800 dark:bg-green-300";                     // >= 8 saat (En koyu yeşil)
  };

  const monthLabels: { label: string; weekIndex: number }[] = [];
  let previousMonth: number | null = null;
  weeks.forEach((week, weekIndex) => {
    // Haftanın ortasındaki günün ayını kontrol et (veya ilk gününü)
    const firstDayInWeekStr = week.find(d => d.count !== -1)?.date; // Placeholder olmayan ilk gün
    if (firstDayInWeekStr) {
      const firstDayDate = new Date(firstDayInWeekStr + "T00:00:00");
      const currentMonth = firstDayDate.getMonth();
      if (previousMonth === null || currentMonth !== previousMonth) {
        // Ay değiştiğinde veya ilk ayda etiket ekle
        // Etiketi, mevcut haftanın sağına değil, başladığı haftanın soluna koymak daha iyi olabilir.
        // Bu yüzden weeks.slice().reverse() yapmadan önceki weekIndex'i kullanmak daha doğru.
        // Ancak render ters olduğu için, reverse edilmiş index'e göre ayar yapalım.
        // Ya da en basiti: monthLabels'ı oluştururken orijinal `weeks` sırasına göre oluştur, sonra render'da kullan.
        // Şu anki `weeks` zaten doğru sırada (geçmişten bugüne). `slice().reverse()` render'da yapılıyor.
        monthLabels.push({ label: getMonthName(currentMonth), weekIndex });
        previousMonth = currentMonth;
      }
    }
  });

  return (
    <TooltipProvider delayDuration={100}>
      <div className="relative">
        {/* Ay Etiketleri */}
        <div className="flex mb-1 space-x-1" style={{ paddingLeft: '30px' /* Gün etiketleri için boşluk */ }}>
          {weeks.map((week, weekIndex) => {
            const monthLabel = monthLabels.find(m => m.weekIndex === weekIndex);
            let showLabel = false;
            if (monthLabel) {
              showLabel = true;
            }

            return (
              <div 
                key={`month-col-${weekIndex}`}
                className="flex-shrink-0 w-4 text-center" // Genişlik w-4 olarak güncellendi (gün kareleriyle aynı)
              >
                {showLabel ? (
                  <span className="text-xs text-muted-foreground">
                    {monthLabel?.label}
                  </span>
                ) : (
                  <span>&nbsp;</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex">
          {/* Gün Etiketleri (Mon, Wed, Fri) */}
          <div className="flex flex-col justify-around pr-4 w-[32px] text-xs text-muted-foreground">
            <span>&nbsp;</span>
            <span className="h-4 flex items-center">Mon</span>
            <span>&nbsp;</span>
            <span className="h-4 flex items-center">Wed</span>
            <span>&nbsp;</span>
            <span className="h-4 flex items-center">Fri</span>
            <span>&nbsp;</span>
          </div>

          {/* Isı Haritası Kareleri */}
          <div className="flex overflow-x-auto space-x-1 flex-grow">
            {weeks.map((weekData, weekIndex) => (
              <div key={`week-${weekIndex}`} className="flex flex-col space-y-1">
                {weekData.map((day, dayIndex) => {
                  if (day.count === -1) { 
                    return <div key={`day-placeholder-${dayIndex}-${weekIndex}`} className="w-4 h-4 rounded-sm bg-transparent" />;
                  }
                  return (
                    <Tooltip key={`day-${day.date}`}>
                      <TooltipTrigger asChild>
                        <div
                          className={`w-4 h-4 rounded-sm cursor-default ${getColor(day.count, day.totalActiveMs)}`}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-sm">
                          {day.totalActiveMs > 0 ? formatDuration(day.totalActiveMs) : "No activity"}
                        </p>
                        <p className="text-xs text-muted-foreground">{day.date}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end text-xs text-muted-foreground p-2 mt-1 space-x-2">
        <span>Less</span>
        <div className="w-3 h-3 rounded-sm bg-gray-200 dark:bg-gray-700" title="No activity"></div>
        <div className="w-3 h-3 rounded-sm bg-green-200 dark:bg-green-900" title="0-2 hours"></div>
        <div className="w-3 h-3 rounded-sm bg-green-400 dark:bg-green-700" title="2-4 hours"></div>
        <div className="w-3 h-3 rounded-sm bg-green-600 dark:bg-green-500" title="4-6 hours"></div>
        <div className="w-3 h-3 rounded-sm bg-green-700 dark:bg-green-400" title="6-8 hours"></div>
        <div className="w-3 h-3 rounded-sm bg-green-800 dark:bg-green-300" title="8+ hours"></div>
        <span>More</span>
      </div>
    </TooltipProvider>
  );
};

export default ActivityHeatmap; 