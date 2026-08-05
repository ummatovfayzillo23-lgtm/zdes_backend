import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { SalaryAdjustmentController } from './salary-adjustment.controller';
import { SalaryAdjustmentService } from './salary-adjustment.service';

@Module({
  imports: [NotificationModule],
  controllers: [SalaryAdjustmentController],
  providers: [SalaryAdjustmentService],
})
export class SalaryAdjustmentModule {}
