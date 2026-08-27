import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/congif/prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';

@Module({
  imports: [PrismaModule, NotificationModule],
  controllers: [TaskController],
  providers: [TaskService],
  exports: [TaskService],
})
export class TaskModule {}
