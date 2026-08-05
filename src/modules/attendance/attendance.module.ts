import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './services/attendance.service';
import { AwsFaceVerificationService } from './services/aws-face-verification.service';
import { AwsS3Service } from './services/aws-s3.service';

@Module({
  imports: [NotificationModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, AwsFaceVerificationService, AwsS3Service],
})
export class AttendanceModule {}
