import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { CommonModule } from './common/common.module';
import { AccessTokenGuard } from './common/guards/access-token.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { UserThrottlerGuard } from './common/guards/user-throttler.guard';
import { FirebaseModule } from './common/firebase/firebase.module';
import { RedisModule } from './common/redis/redis.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AdvanceModule } from './modules/advance/advance.module';
import { AppVersionModule } from './modules/app-version/app-version.module';
import { AuthModule } from './modules/auth/auth.module';
import { BranchModule } from './modules/branch/branch.module';
import { CompanyModule } from './modules/company/company.module';
import { DepartmentModule } from './modules/department/department.module';
import { EmployeeLeaveModule } from './modules/employee-leave/employee-leave.module';
import { HolidayModule } from './modules/holiday/holiday.module';
import { NotificationModule } from './modules/notification/notification.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { PositionModule } from './modules/position/position.module';
import { PushTokenModule } from './modules/push-token/push-token.module';
import { RawAttendanceLogModule } from './modules/raw-attendance-log/raw-attendance-log.module';
import { RefreshTokenModule } from './modules/refresh-token/refresh-token.module';
import { SalaryAdjustmentModule } from './modules/salary-adjustment/salary-adjustment.module';
import { SettingModule } from './modules/setting/setting.module';
import { TaskModule } from './modules/task/task.module';
import { TerminalModule } from './modules/terminal/terminal.module';
import { TurnstileModule } from './modules/turnstile/turnstile.module';
import { UserModule } from './modules/user/user.module';
import { WorkScheduleModule } from './modules/work-schedule/work-schedule.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.RATE_LIMIT_TTL_MS ?? 60_000),
        limit: Number(process.env.RATE_LIMIT_MAX ?? 100),
      },
    ]),
    RedisModule,
    FirebaseModule,
    CommonModule,
    AttendanceModule,
    AdvanceModule,
    AppVersionModule,
    AuthModule,
    CompanyModule,
    BranchModule,
    DepartmentModule,
    HolidayModule,
    EmployeeLeaveModule,
    TerminalModule,
    RawAttendanceLogModule,
    SalaryAdjustmentModule,
    PayrollModule,
    SettingModule,
    NotificationModule,
    PushTokenModule,
    RefreshTokenModule,
    PositionModule,
    UserModule,
    WorkScheduleModule,
    TurnstileModule,
    TaskModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AccessTokenGuard,
    },
    {
      provide: APP_GUARD,
      useClass: UserThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
