import { PickType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';

export class UpdateOwnProfileDto extends PickType(CreateUserDto, [
  'firstName',
  'lastName',
  'middleName',
  'phone',
  'email',
  'address',
  'passportSerial',
  'dateOfBirth',
  'avatarUrl',
] as const) {}
