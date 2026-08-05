import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateWorkScheduleDto } from './create-work-schedule.dto';

export class UpdateWorkScheduleDto extends PartialType(
  OmitType(CreateWorkScheduleDto, ['companyId', 'branchId', 'userId'] as const),
) {}
