import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PurchasingService } from './purchasing.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Roles } from '../auth/roles.decorator';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentActor } from '../auth/actor.decorator';
import type { Actor } from '../auth/auth.types';
import {
  createSupplierOrderSchema,
  createSupplierPaymentSchema,
  createSupplierSchema,
  listSupplierOrdersQuerySchema,
  listSupplierPaymentsQuerySchema,
  type CreateSupplierDto,
  type CreateSupplierOrderDto,
  type CreateSupplierPaymentDto,
  type ListSupplierOrdersQueryDto,
  type ListSupplierPaymentsQueryDto,
} from './dto/supplier.dto';

/**
 * Suppliers are readable by anyone signed in (the POS shows who a product came from), but
 * everything about MONEY here is restricted: receiving a shipment sets cost prices, and the
 * shipment history is what the clinic paid — so writes are admin-only and the order list
 * sits behind the same financials:read grant as Money in / out.
 */
@Controller('purchasing')
export class PurchasingController {
  constructor(private readonly purchasing: PurchasingService) {}

  @Get('suppliers')
  listSuppliers() {
    return this.purchasing.listSuppliers();
  }

  @Post('suppliers')
  @Roles('admin')
  createSupplier(@Body(new ZodValidationPipe(createSupplierSchema)) dto: CreateSupplierDto) {
    return this.purchasing.createSupplier(dto);
  }

  @Get('supplier-orders')
  @Permissions('financials:read')
  listOrders(@Query(new ZodValidationPipe(listSupplierOrdersQuerySchema)) query: ListSupplierOrdersQueryDto) {
    return this.purchasing.listOrders(query);
  }

  @Post('supplier-orders')
  @Roles('admin')
  createOrder(
    @Body(new ZodValidationPipe(createSupplierOrderSchema)) dto: CreateSupplierOrderDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.purchasing.createOrder(dto, actor);
  }

  /** Every supplier's running balance — what they've been shipped vs. what's been paid.
   *  Same access as the order list: it's still a fact about clinic spending. */
  @Get('supplier-balances')
  @Permissions('financials:read')
  supplierBalances() {
    return this.purchasing.supplierBalances();
  }

  @Get('supplier-payments')
  @Permissions('financials:read')
  listPayments(@Query(new ZodValidationPipe(listSupplierPaymentsQuerySchema)) query: ListSupplierPaymentsQueryDto) {
    return this.purchasing.listPayments(query);
  }

  @Post('supplier-payments')
  @Roles('admin')
  createPayment(
    @Body(new ZodValidationPipe(createSupplierPaymentSchema)) dto: CreateSupplierPaymentDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.purchasing.createPayment(dto, actor);
  }
}
