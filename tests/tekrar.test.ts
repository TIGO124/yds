import { describe, expect, it } from 'vitest';
import { OGRENILDI, gunSonra, kacGunSonra, kutuIlerlet, siradakiler, sonrakiMetni, tekrarDurumlari, tekrarTakvimi } from '../src/engine/tekrar';

// 2026-09-28 pazartesi 21:30
const pazartesi = new Date(2026, 8, 28, 21, 30).getTime();
const gun = (n: number, saat = 10) => new Date(2026, 8, 28 + n, saat).getTime();
const gece = (n: number) => new Date(2026, 8, 28 + n).getTime();

describe('aralıklı tekrar (Leitner)', () => {
  it('yanlış ertesi gün, doğrular 3 ve 7 gün sonra; 3 doğruda öğrenilir', () => {
    expect(OGRENILDI).toBe(3);
    expect(kutuIlerlet(0, false, pazartesi)).toEqual({ kutu: 0, sonraki: gece(1) });
    expect(kutuIlerlet(0, true, pazartesi)).toEqual({ kutu: 1, sonraki: gece(3) });
    expect(kutuIlerlet(1, true, pazartesi)).toEqual({ kutu: 2, sonraki: gece(7) });
    expect(kutuIlerlet(2, true, pazartesi).kutu).toBe(OGRENILDI);
    expect(kutuIlerlet(2, false, pazartesi)).toEqual({ kutu: 0, sonraki: gece(1) });
  });

  it('gün sınırı yerel takvime göre: gece yarısından sonra sırası gelir', () => {
    expect(gunSonra(pazartesi, 1)).toBe(gece(1));
    expect(kacGunSonra(gece(1), new Date(pazartesi))).toBe(1);
    expect(kacGunSonra(gece(0) - 1, new Date(pazartesi))).toBe(0);
  });

  it('yalnızca yanlışlanan sorular tekrara girer; öğrenilen çıkar, yeniden yanlışlanan baştan başlar', () => {
    const c = (soru_id: string, dogru_mu: boolean, tarih: number) => ({ soru_id, dogru_mu, tarih });
    const d = tekrarDurumlari([
      c('dogru', true, gun(0)),
      c('x', false, gun(0)),
      c('y', false, gun(0)),
      c('x', true, gun(1)),
      c('x', true, gun(4)),
      c('x', true, gun(11)),
      c('y', true, gun(1)),
      c('z', false, gun(0)),
      c('z', true, gun(1)),
      c('z', false, gun(4)),
    ]);
    expect([...d.keys()].sort()).toEqual(['y', 'z']);
    expect(d.get('y')).toMatchObject({ kutu: 1, sonraki: gece(4) });
    expect(d.get('z')).toMatchObject({ kutu: 0, sonraki: gece(5) });
  });

  it('sırası gelenler en çok geciken önce; öğrenilmişler hiç gelmez', () => {
    const kayitlar = [
      { id: 'a', kutu: 0, sonraki: gece(1) },
      { id: 'b', kutu: 1, sonraki: gece(0) },
      { id: 'c', kutu: 0, sonraki: gece(5) },
      { id: 'd', kutu: OGRENILDI, sonraki: gece(0) },
    ];
    expect(siradakiler(kayitlar, gun(2)).map((k) => k.id)).toEqual(['b', 'a']);
  });

  it('takvim: gecikmişler bugüne, sonrakiler günlerine yazılır', () => {
    const t = tekrarTakvimi(
      [
        { kutu: 0, sonraki: gece(-2) },
        { kutu: 1, sonraki: gece(1) },
        { kutu: 1, sonraki: gece(1) },
        { kutu: 2, sonraki: gece(6) },
        { kutu: 2, sonraki: gece(9) },
      ],
      new Date(pazartesi),
    );
    expect(t).toEqual([1, 2, 0, 0, 0, 0, 1]);
  });

  it('durum metni', () => {
    const simdi = new Date(pazartesi);
    expect(sonrakiMetni(gece(0), simdi)).toBe('Sırada');
    expect(sonrakiMetni(gece(1), simdi)).toBe('Yarın');
    expect(sonrakiMetni(gece(3), simdi)).toBe('3 gün sonra');
  });
});
