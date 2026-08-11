import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceDemoSeedService } from './services/attendance-demo-seed.service';
import { AttendanceService } from './services/attendance.service';
import { AwsFaceVerificationService } from './services/aws-face-verification.service';
import { AwsS3Service } from './services/aws-s3.service';

@Module({
  imports: [NotificationModule],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    AwsFaceVerificationService,
    AwsS3Service,
    AttendanceDemoSeedService,
  ],
})
export class AttendanceModule {}
