import { Body, Controller, Get, Post } from '@nestjs/common';
import { PurchasingService } from './purchasing.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Roles } from '../auth/roles.decorator';
import { CurrentActor } from '../auth/actor.decorator';
import type { Actor } from '../auth/auth.types';
import {
  createSupplierOrderSchema,
  createSupplierSchema,
  type CreateSupplierDto,
  type CreateSupplierOrderDto,
} from './dto/supplier.dto';

@Controller('purchasing')
export class PurchasingController {
  constructor(private readonly purchasing: PurchasingService) {}

  @Get('suppliers')
  listSuppliers() {
    return this.purchasing.listSuppliers();
  }

  @Post('suppliers')
  @Roles('doctor')
  createSupplier(@Body(new ZodValidationPipe(createSupplierSchema)) dto: CreateSupplierDto) {
    return this.purchasing.createSupplier(dto);
  }

  @Get('supplier-orders')
  listOrders() {
    return this.purchasing.listOrders();
  }

  @Post('supplier-orders')
  @Roles('doctor')
  createOrder(
    @Body(new ZodValidationPipe(createSupplierOrderSchema)) dto: CreateSupplierOrderDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.purchasing.createOrder(dto, actor);
  }
}
