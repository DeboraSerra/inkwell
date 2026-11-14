-- AlterTable
ALTER TABLE "UserBook" ADD COLUMN     "acquiredAt" TIMESTAMP(3),
ADD COLUMN     "acquiredAtPrecision" "DatePrecision" NOT NULL DEFAULT 'DAY';
