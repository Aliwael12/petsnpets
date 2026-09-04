import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ProductsService } from './products.service';
import { Permissions } from '../auth/permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentActor } from '../auth/actor.decorator';
import type { Actor } from '../auth/auth.types';
import {
  createProductSchema,
  listProductsQuerySchema,
  priceCheckQuerySchema,
  updateProductSchema,
  type CreateProductDto,
  type ListProductsQueryDto,
  type PriceCheckQueryDto,
  type UpdateProductDto,
} from './dto/product.dto';

// Pipes are scoped to the specific @Body()/@Query() parameter they validate, never applied
// at the method level via @UsePipes() — a method-level pipe runs against EVERY resolved
// parameter, including @CurrentActor()'s Actor object, which doesn't match these schemas
// and would fail validation before the real body is ever checked.

@Controller('catalog/products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listProductsQuerySchema)) query: ListProductsQueryDto) {
    return this.products.list(query);
  }

  @Get('price-check')
  priceCheck(@Query(new ZodValidationPipe(priceCheckQuerySchema)) query: PriceCheckQueryDto) {
    return this.products.priceCheck(query.q);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.getOrThrow(id);
  }

  @Post()
  @Permissions('products:write')
  create(@Body(new ZodValidationPipe(createProductSchema)) dto: CreateProductDto, @CurrentActor() actor: Actor) {
    return this.products.create(dto, actor);
  }

  @Patch(':id')
  @Permissions('products:write')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) dto: UpdateProductDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.products.update(id, dto, actor);
  }
}
