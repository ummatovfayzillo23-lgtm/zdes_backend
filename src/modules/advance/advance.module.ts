import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { AdvanceController } from './advance.controller';
import { AdvanceService } from './advance.service';

@Module({
  imports: [NotificationModule],
  controllers: [AdvanceController],
  providers: [AdvanceService],
})
export class AdvanceModule {}
