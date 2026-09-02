import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { DbModule } from './db/db.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { OperatorAuthGuard } from './auth/operator-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { CatalogModule } from './catalog/catalog.module';
import { InventoryModule } from './inventory/inventory.module';
import { PurchasingModule } from './purchasing/purchasing.module';
import { DiscountsModule } from './discounts/discounts.module';
import { SalesModule } from './sales/sales.module';
import { RefundsModule } from './refunds/refunds.module';
import { ClientsModule } from './clients/clients.module';
import { PetsModule } from './pets/pets.module';
import { PetLogsModule } from './pet-logs/pet-logs.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { ExpensesModule } from './expenses/expenses.module';
import { SupabaseModule } from './supabase/supabase.module';
import { InvoicesModule } from './invoices/invoices.module';
import { EmployeesModule } from './employees/employees.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    DbModule,
    CommonModule,
    AuthModule,
    InventoryModule,
    CatalogModule,
    PurchasingModule,
    DiscountsModule,
    SalesModule,
    RefundsModule,
    ClientsModule,
    PetsModule,
    PetLogsModule,
    AppointmentsModule,
    ExpensesModule,
    SupabaseModule,
    InvoicesModule,
    EmployeesModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [
    // Every route requires a valid operator token by default (opt out with @Public()),
    // and RolesGuard enforces @Roles() where present — both apply globally so a new
    // route can't accidentally ship unauthenticated.
    { provide: APP_GUARD, useClass: OperatorAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
