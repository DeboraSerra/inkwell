-- CreateEnum
CREATE TYPE "DatePrecision" AS ENUM ('DAY', 'MONTH', 'YEAR');

-- AlterTable
ALTER TABLE "ReadThrough" ADD COLUMN     "endedAtPrecision" "DatePrecision" NOT NULL DEFAULT 'DAY',
ADD COLUMN     "startedAtPrecision" "DatePrecision" NOT NULL DEFAULT 'DAY';
