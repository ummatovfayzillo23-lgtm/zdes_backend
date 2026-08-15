import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceDemoSeedService } from './services/attendance-demo-seed.service';
import { AttendanceService } from './services/attendance.service';
import { AwsFaceVerificationService } from './services/aws-face-verification.service';

@Module({
  imports: [NotificationModule],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    AwsFaceVerificationService,
    AttendanceDemoSeedService,
  ],
})
export class AttendanceModule {}
