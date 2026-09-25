import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { PurchasingModule } from '../purchasing/purchasing.module';

@Module({
  imports: [PurchasingModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
