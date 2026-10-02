import { Module } from '@nestjs/common';
import { BoardingsService } from './boardings.service';
import { BoardingsController } from './boardings.controller';
import { SalesModule } from '../sales/sales.module';

@Module({
  imports: [SalesModule],
  controllers: [BoardingsController],
  providers: [BoardingsService],
})
export class BoardingsModule {}
