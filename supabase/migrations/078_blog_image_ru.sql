-- Російська обкладинка статті (у зображення вшито заголовок — для /ru потрібен
-- окремий файл з російським текстом). NULL → фолбек на укр обкладинку `image`.
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS image_ru text;
