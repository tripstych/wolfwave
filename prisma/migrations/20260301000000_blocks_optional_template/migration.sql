-- AlterTable: make template_id optional on blocks
ALTER TABLE `blocks` MODIFY `template_id` INT NULL;
ALTER TABLE `blocks` DROP FOREIGN KEY `blocks_ibfk_1`;
ALTER TABLE `blocks` ADD CONSTRAINT `blocks_ibfk_1` FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE RESTRICT;
