(() => {
    const state = {
        floors: 9,
        capacity: 400,
        stepMs: 5000,
        running: false,
        cabin: { floor: 1, dir: 'idle', doors: 'closed', passengers: [] },
        calls: new Set(), 
        targets: new Set(),
        passengers: [], 
        stats: { trips: 0, empty: 0, totalWeight: 0, created: 0, delivered: 0 },
        timer: null,
    };

    const $ = (id) => document.getElementById(id);

    function log(msg, cls) {
        const el = $('log');
        const t = new Date().toLocaleTimeString('ru-RU');
        const div = document.createElement('div');
        div.className = 'entry ' + (cls || '');
        div.innerHTML = `<span class="t">[${t}]</span>${msg}`;
        el.appendChild(div);
        el.scrollTop = el.scrollHeight;
    }

    function buildShaft() {
        const shaft = $('shaft');
        shaft.innerHTML = '';
        for (let i = 1; i <= state.floors; i++) {
            const f = document.createElement('div');
            f.className = 'floor';
            f.dataset.floor = i;
            f.innerHTML = `
                <div class="floor-label">Этаж ${i}</div>
                <div class="floor-cabin"></div>
                <button class="call-btn" data-floor="${i}" title="Вызвать лифт">▲▼</button>
            `;
            shaft.appendChild(f);
        }
        shaft.querySelectorAll('.call-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const fn = parseInt(btn.dataset.floor, 10);
                if (!state.running) {
                    log('Запустите систему перед вызовом лифта', 'warn');
                    return;
                }
                if (fn === state.cabin.floor && state.cabin.dir === 'idle') {
                    log(`Лифт уже на этаже ${fn}`, 'ok');
                    return;
                }
                state.calls.add(fn);
                btn.classList.add('pressed');
                btn.closest('.floor').classList.add('has-call');
                log(`Вызов на этаж ${fn}`);
                render();
            });
        });
        render();
    }

    function totalCabinWeight() {
        return state.cabin.passengers.reduce((s, p) => s + p.weight, 0);
    }

    function render() {
        document.querySelectorAll('.floor').forEach(el => {
            const fn = parseInt(el.dataset.floor, 10);
            el.classList.toggle('cabin-here', fn === state.cabin.floor);
            el.classList.toggle('doors-open', fn === state.cabin.floor && state.cabin.doors === 'open');
            const cabinSlot = el.querySelector('.floor-cabin');
            if (fn === state.cabin.floor) {
                cabinSlot.textContent = state.cabin.passengers.length > 0
                    ? `Кабина · ${state.cabin.passengers.length} чел.`
                    : 'Кабина (пустая)';
            } else {
                cabinSlot.textContent = '';
            }
        });

        $('stat-floor').textContent = state.cabin.floor;
        const dirText = { up: '▲ вверх', down: '▼ вниз', idle: 'стоит' }[state.cabin.dir];
        $('stat-dir').textContent = dirText;
        $('stat-weight').textContent = totalCabinWeight() + ' кг';
        $('stat-incabin').textContent = state.cabin.passengers.length;
        $('stat-queue').textContent = state.passengers.length;

        $('stat-trips').textContent = state.stats.trips;
        $('stat-empty').textContent = state.stats.empty;
        $('stat-totalweight').textContent = state.stats.totalWeight + ' кг';
        $('stat-totalp').textContent = state.stats.created;

        $('sb-moving').textContent = state.cabin.dir !== 'idle' ? 1 : 0;
        $('sb-stopped').textContent = state.cabin.dir === 'idle' ? 1 : 0;
        $('sb-delivered').textContent = state.stats.delivered;

        $('indicator-direction').textContent = dirText;
        $('indicator-direction').classList.toggle('active', state.cabin.dir !== 'idle');
        $('indicator-doors').textContent = 'Двери: ' + (state.cabin.doors === 'open' ? 'открыты' : 'закрыты');
        const overload = totalCabinWeight() > state.capacity;
        const ind = $('indicator-overload');
        ind.classList.toggle('overload-on', overload);
        ind.classList.toggle('overload-off', !overload);
    }

    function pickNextTarget() {

        const all = new Set([...state.targets, ...state.calls]);
        if (all.size === 0) return null;
        // Prefer to keep direction
        const arr = [...all].sort((a, b) => a - b);
        if (state.cabin.dir === 'up') {
            const above = arr.filter(f => f > state.cabin.floor);
            if (above.length) return above[0];
            return arr[arr.length - 1];
        }
        if (state.cabin.dir === 'down') {
            const below = arr.filter(f => f < state.cabin.floor).reverse();
            if (below.length) return below[0];
            return arr[0];
        }
        return arr.reduce((best, f) =>
            Math.abs(f - state.cabin.floor) < Math.abs(best - state.cabin.floor) ? f : best
        , arr[0]);
    }

    function tick() {
        if (!state.running) return;

        const target = pickNextTarget();

        if (target === null) {
            if (state.cabin.dir !== 'idle') {
                state.cabin.dir = 'idle';
                state.cabin.doors = 'closed';
                log('Лифт ожидает', 'ok');
            }
            render();
            return;
        }

        if (state.cabin.floor === target) {
            state.cabin.doors = 'open';
            state.calls.delete(target);
            state.targets.delete(target);

            const arrived = state.cabin.passengers.filter(p => p.to === target);
            state.cabin.passengers = state.cabin.passengers.filter(p => p.to !== target);
            arrived.forEach(p => {
                state.stats.delivered += 1;
                state.stats.totalWeight += p.weight;
                log(`Пассажир (${p.weight} кг) доставлен на этаж ${target}`, 'ok');
            });

            const remainingQueue = [];
            for (const p of state.passengers) {
                if (p.from === target) {
                    if (totalCabinWeight() + p.weight <= state.capacity) {
                        state.cabin.passengers.push(p);
                        state.targets.add(p.to);
                        log(`Пассажир (${p.weight} кг) сел на этаж ${target}, цель ${p.to}`);
                    } else {
                        log(`Перегрузка: пассажир (${p.weight} кг) остался на этаже ${target}`, 'warn');
                        remainingQueue.push(p);
                    }
                } else {
                    remainingQueue.push(p);
                }
            }
            state.passengers = remainingQueue;
            document.querySelectorAll(`.call-btn[data-floor="${target}"]`).forEach(b => {
                b.classList.remove('pressed');
                b.closest('.floor').classList.remove('has-call');
            });

            state.cabin.dir = 'idle';
            render();
            // Close doors next tick
            setTimeout(() => {
                state.cabin.doors = 'closed';
                render();
            }, Math.min(1500, state.stepMs / 2));
            return;
        }

        const newDir = target > state.cabin.floor ? 'up' : 'down';
        if (state.cabin.dir !== newDir) {
            state.stats.trips += 1;
            if (state.cabin.passengers.length === 0) state.stats.empty += 1;
        }
        state.cabin.dir = newDir;
        state.cabin.doors = 'closed';
        state.cabin.floor += newDir === 'up' ? 1 : -1;
        log(`Лифт прошёл этаж ${state.cabin.floor} (${newDir === 'up' ? '▲' : '▼'})`);
        render();
    }

    function start() {
        if (state.running) return;
        state.floors = parseInt($('floors').value, 10);
        state.capacity = parseInt($('capacity').value, 10);
        state.stepMs = parseInt($('speed').value, 10) * 1000;
        buildShaft();
        state.running = true;
        log('Система запущена', 'ok');
        $('btn-start').disabled = true;
        state.timer = setInterval(tick, state.stepMs);
    }

    function stop() {
        if (!state.running) return;
        if (state.cabin.passengers.length > 0) {
            log('Невозможно остановить: в кабине есть пассажиры', 'err');
            return;
        }
        state.running = false;
        clearInterval(state.timer);
        $('btn-start').disabled = false;
        log('Система остановлена', 'warn');
        log(`Итого: ${state.stats.trips} поездок, ${state.stats.empty} холостых, ${state.stats.totalWeight} кг, ${state.stats.created} пассажиров создано, ${state.stats.delivered} доставлено`, 'ok');
    }

    function addPassenger() {
        if (!state.running) {
            log('Запустите систему перед добавлением пассажира', 'warn');
            return;
        }
        const w = parseInt($('p-weight').value, 10);
        const from = parseInt($('p-from').value, 10);
        const to = parseInt($('p-to').value, 10);
        if (from === to || from < 1 || to < 1 || from > state.floors || to > state.floors) {
            log('Некорректные этажи', 'err');
            return;
        }
        const p = { id: Date.now(), weight: w, from, to };
        state.passengers.push(p);
        state.calls.add(from);
        state.stats.created += 1;
        const btn = document.querySelector(`.call-btn[data-floor="${from}"]`);
        if (btn) {
            btn.classList.add('pressed');
            btn.closest('.floor').classList.add('has-call');
        }
        log(`Создан пассажир ${w} кг: ${from} → ${to}`);
        render();
    }

    document.addEventListener('DOMContentLoaded', () => {
        buildShaft();
        $('btn-start').addEventListener('click', start);
        $('btn-stop').addEventListener('click', stop);
        $('btn-add').addEventListener('click', addPassenger);
        $('floors').addEventListener('change', () => {
            if (!state.running) {
                state.floors = parseInt($('floors').value, 10);
                buildShaft();
            }
        });
        log('Макет загружен. Задайте параметры и нажмите «Старт».');
    });
})();
