import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { EmployeeLeaveController } from './employee-leave.controller';
import { EmployeeLeaveService } from './employee-leave.service';

@Module({
  imports: [NotificationModule],
  controllers: [EmployeeLeaveController],
  providers: [EmployeeLeaveService],
})
export class EmployeeLeaveModule {}
