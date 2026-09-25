import { Module } from '@nestjs/common';
import { BoardingsService } from './boardings.service';
import { BoardingsController } from './boardings.controller';

@Module({
  controllers: [BoardingsController],
  providers: [BoardingsService],
})
export class BoardingsModule {}
