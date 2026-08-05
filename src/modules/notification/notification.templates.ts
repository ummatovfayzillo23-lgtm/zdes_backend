import type { LeaveDurationType, NotificationIcon } from '@prisma/client';

export interface NotificationTemplate {
  title: string;
  message: string;
  icon: NotificationIcon;
  data?: Record<string, string>;
}

function formatDate(value: Date): string {
  return value.toLocaleDateString('uz-UZ');
}

function withName(name: string | null): string {
  return name ? `${name}, ` : '';
}

function formatPhoneSuffix(phone: string | null): string {
  return phone ? ` Tel: ${phone}` : '';
}

function formatDurationLabel(
  durationType: LeaveDurationType,
  fromDate: Date,
  toDate: Date,
  leaveHours: number | null,
): string {
  if (durationType === 'hourly') {
    return `${leaveHours} soatlik`;
  }

  if (durationType === 'daily') {
    return `${formatDate(fromDate)} kunlik`;
  }

  return `${formatDate(fromDate)} - ${formatDate(toDate)} oralig'idagi`;
}

export const notificationTemplates = {
  advanceCreated(amount: number): NotificationTemplate {
    return {
      title: 'Avans',
      message: `Sizga ${amount} so'm miqdorida avans qo'shildi`,
      icon: 'money',
    };
  },

  employeeLeaveCreated(
    days: number,
    fromDate: Date,
    toDate: Date,
  ): NotificationTemplate {
    return {
      title: "Ta'til",
      message: `Sizga ${days} kunlik ta'til qo'shildi (${formatDate(fromDate)} - ${formatDate(toDate)})`,
      icon: 'briefcase',
    };
  },

  advanceCreatedForOversight(
    employeeName: string,
    amount: number,
  ): NotificationTemplate {
    return {
      title: 'Yangi avans',
      message: `${employeeName} uchun ${amount} so'm miqdorida avans qo'shildi`,
      icon: 'money',
    };
  },

  employeeLeaveCreatedForOversight(
    employeeName: string,
    days: number,
    fromDate: Date,
    toDate: Date,
  ): NotificationTemplate {
    return {
      title: "Yangi ta'til",
      message: `${employeeName} uchun ${days} kunlik ta'til qo'shildi (${formatDate(fromDate)} - ${formatDate(toDate)})`,
      icon: 'briefcase',
    };
  },

  adjustmentApplied(
    type: 'bonus' | 'penalty',
    amount: number,
    category: string,
  ): NotificationTemplate {
    const isBonus = type === 'bonus';
    return {
      title: isBonus ? "Bonus qo'shildi" : 'Jarima qo’llanildi',
      message: isBonus
        ? `Sizga ${amount} so'm bonus qo'shildi (${category})`
        : `Sizdan ${amount} so'm ushlab qolindi (${category})`,
      icon: 'money',
    };
  },

  attendanceLate(
    name: string | null,
    lateMinutes: number,
  ): NotificationTemplate {
    return {
      title: 'Kechikish',
      message: `${withName(name)}, siz bugun ish vaqtidan ${lateMinutes} daqiqa kechikdingiz. Sababsiz kechikishlar yana takrorlansa, Mehnat kodeksining 161 va 312-moddalariga ko‘ra sizga nisbatan intizomiy jazo qo‘llanishi va mehnat shartnomasi bekor qilinishi ma’lum qilinadi.`,
      icon: 'attendance',
    };
  },

  attendanceAbsent(name: string | null): NotificationTemplate {
    return {
      title: 'Ish kunida sababsiz yo\'qlik',
      message: `${withName(name)}, bugungi ish kunida sababsiz yo'qligingiz qayd etildi. Iltimos, bu bo'yicha rahbariyatga tushuntirish bering.`,
      icon: 'attendance',
    };
  },

  attendanceNoCheckout(name: string | null): NotificationTemplate {
    return {
      title: 'Chiqishni tasdiqlash eslatmasi',
      message: `${withName(name)}, bugun ish kuni yakunida tizimdan chiqishni  unutdingiz. Iltimos, chiqqan vaqtingizni tasdiqlab qo'ying.`,
      icon: 'attendance',
    };
  },

  employeeLeaveRequested(
    requestId: string,
    employeeName: string,
    phone: string | null,
    durationType: LeaveDurationType,
    fromDate: Date,
    toDate: Date,
    leaveHours: number | null,
  ): NotificationTemplate {
    const durationLabel = formatDurationLabel(
      durationType,
      fromDate,
      toDate,
      leaveHours,
    );
    return {
      title: "Yangi ta'til so'rovi",
      message: `${employeeName} ${durationLabel} ta'til so'ramoqda.${formatPhoneSuffix(phone)} Tasdiqlash yoki rad etish uchun ilovaga o'ting.`,
      icon: 'briefcase',
      data: {
        type: 'leave_request',
        requestId,
        employeeName,
        phone: phone ?? '',
      },
    };
  },

  employeeLeaveApproved(
    durationType: LeaveDurationType,
    fromDate: Date,
    toDate: Date,
    leaveHours: number | null,
  ): NotificationTemplate {
    const durationLabel = formatDurationLabel(
      durationType,
      fromDate,
      toDate,
      leaveHours,
    );
    return {
      title: "Ta'til tasdiqlandi",
      message: `Sizning ${durationLabel} ta'til so'rovingiz tasdiqlandi.`,
      icon: 'briefcase',
    };
  },

  employeeLeaveRejected(
    durationType: LeaveDurationType,
    fromDate: Date,
    toDate: Date,
    leaveHours: number | null,
  ): NotificationTemplate {
    const durationLabel = formatDurationLabel(
      durationType,
      fromDate,
      toDate,
      leaveHours,
    );
    return {
      title: "Ta'til rad etildi",
      message: `Sizning ${durationLabel} ta'til so'rovingiz rad etildi.`,
      icon: 'briefcase',
    };
  },
};
