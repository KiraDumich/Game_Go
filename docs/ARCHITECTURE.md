# Архитектура «Пиксельных гонок» — как есть сейчас

Схема реальной игры, а не «идеальной архитектуры». Три части:

1. [Из чего состоит игра](#1-из-чего-состоит-игра) — файлы и кто кого запускает.
2. [Состояния гонки](#2-состояния-гонки) — что происходит от старта до финиша.
3. [Один кадр гонки](#3-один-кадр-гонки) — что по порядку делает `update()`.

---

## 1. Из чего состоит игра

Сплошная стрелка — запускает. Пунктир — берёт данные или настройки.

```mermaid
flowchart LR
  subgraph START["1 · Запуск"]
    main["main.ts"] --> config["config.ts<br/>создаёт игру Phaser"]
  end

  subgraph SCENES["2 · Сцены"]
    Shop["ShopScene<br/>гараж: выбор машины"]
    Game["GameScene<br/>гонка"]
  end

  subgraph DATA["3 · Данные и настройки"]
    Conf["gameConfig.ts<br/>GAME_CONFIG — числа баланса"]
    Levels["levels.ts<br/>LEVELS — 3 уровня"]
    Cars["cars.ts<br/>CARS — машины игрока"]
  end

  subgraph GFX["4 · Графика"]
    Pixel["pixelArt.ts<br/>дорога, конус, соперники"]
    RW["roadworks.ts + src/assets/<br/>дорожные работы, машины игрока"]
  end

  config --> Shop
  Shop -- "Enter / «В ГОНКУ»" --> Game
  Game -- "M — в гараж" --> Shop
  Shop -.-> Cars
  Game -.-> Conf
  Game -.-> Levels
  Game -.-> Cars
  Game -.-> Pixel
  Game -.-> RW
```

| Файл | За что отвечает |
|---|---|
| `main.ts`, `config.ts` | запуск: размер экрана, пиксельная графика, список сцен |
| `ShopScene.ts` | гараж: карточки машин, листание, сохранение выбора |
| `GameScene.ts` | вся гонка: управление, препятствия, столкновения, фазы, финиш, интерфейс |
| `gameConfig.ts` | все числа баланса в одном объекте `GAME_CONFIG` |
| `levels.ts` | настройки трёх уровней и правила фазы 2 (`withPhase2`) |
| `cars.ts` | список машин игрока, сохранение выбора в браузере |
| `pixelArt.ts` | текстуры, нарисованные кодом |
| `roadworks.ts` | спрайты, анимации и раскладка участка дорожных работ |

---

## 2. Состояния гонки

Поле `state` в `GameScene`. Перезапуск уровня и переход на следующий идут через одну
функцию `goToLevel()`.

```mermaid
stateDiagram-v2
  direction LR
  state "Подсказка<br/>(только 3-й уровень)" as tutorial
  state "Отсчёт 3-2-1" as countdown
  state "Гонка" as racing
  state "Пауза" as paused
  state "Авария" as crashed
  state "Финиш" as finished

  [*] --> tutorial: есть подсказка
  [*] --> countdown: нет подсказки
  tutorial --> countdown: Enter
  countdown --> racing: прошло 3 с
  countdown --> paused: P
  racing --> paused: P
  paused --> racing: P
  racing --> crashed: жизни = 0
  racing --> finished: пересёк финиш
  crashed --> [*]: R — заново, M — гараж
  finished --> [*]: Enter — след. уровень, R / M после 3-го
```

---

## 3. Один кадр гонки

Пока идёт гонка, `update()` примерно 60 раз в секунду вызывает функции строго по порядку.
Все числа они берут из `GAME_CONFIG` и настроек уровня.

```mermaid
flowchart TB
  subgraph P["Игрок"]
    direction LR
    A["1. updateSpeed<br/>газ, тормоз, нитро"] --> B["2. steer<br/>руль"]
  end

  subgraph W["Мир"]
    direction LR
    C["3. scrollWorld<br/>дорога и препятствия<br/>едут вниз"] --> D["4. spawnObstacles<br/>новые конусы и машины"]
    D --> E["5. spawnRoadworks<br/>участки дорожных работ"]
  end

  subgraph R["Проверки"]
    direction LR
    F["6. checkCollisions<br/>удар: −жизнь, −скорость"] --> G["7. checkPhase<br/>фаза 2 с середины<br/>(2-й уровень)"]
    G --> H["8. checkFinish<br/>доехал до финиша?"]
  end

  subgraph U["Экран"]
    direction LR
    I["9. updateHud<br/>время, скорость, жизни, прогресс"]
  end

  P --> W --> R --> U
```

### Кто чьё состояние меняет

| Функция | Что меняет |
|---|---|
| `updateSpeed`, `steer` | скорость, таймеры нитро, положение машины игрока |
| `scrollWorld` | пройденный путь, позиции дороги и препятствий; удаляет уехавшее за экран |
| `spawnObstacles`, `spawnRoadworks` | список препятствий, перекрытую полосу |
| `checkCollisions` | жизни, скорость, неуязвимость; при 0 жизней — состояние «Авария» |
| `checkPhase` | фазу и действующие правила (`rules = withPhase2(level)`), цвет трассы |
| `checkFinish` | состояние «Финиш», рекорд уровня, общее время забега |
| пауза (P) | состояние «Пауза»; при продолжении сдвигает таймеры на длину паузы |
| `goToLevel` | перезапускает сцену с данными забега (номер уровня, общее время) |
