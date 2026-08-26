import { Module } from '@nestjs/common';
import { PetLogsService } from './pet-logs.service';
import { PetLogsController } from './pet-logs.controller';

@Module({
  controllers: [PetLogsController],
  providers: [PetLogsService],
})
export class PetLogsModule {}
