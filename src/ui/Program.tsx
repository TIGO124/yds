import { useState } from 'preact/hooks';
import { KONU_MAP, konuAdi } from '../data/bank';
import { depo } from '../depo';
import type { Etkinlik, ProgramGunu } from '../engine/program';
import { tarihMetni } from '../engine/program';
import type { Ayarlar } from '../types';
import { Cubuk, Sayfa, Ust, Yukleniyor, useVeri } from './ortak';
import { gunBasligi, notMetni, programVerisi, sureMetni } from './programVeri';
import { git } from './router';

const ASAMA_AD = { teshis: 'Teşhis aşaması', normal: 'Kişisel program', son_hafta: 'Son hafta' } as const;

async function testBaslat(setHata: (m: string) => void) {
  try {
    git(`/test/${await depo.sonrakiTestiBaslat()}`);
  } catch (e) {
    setHata(e instanceof Error ? e.message : String(e));
  }
}

export async function konuTestiBaslat(konu: string, setHata: (m: string) => void) {
  try {
    git(`/test/${await depo.konuTestiBaslat(konu)}`);
  } catch (e) {
    setHata(e instanceof Error ? e.message : String(e));
  }
}

/** Tek bir program etkinliği; bugün için eylem düğmesi gösterir. */
export function EtkinlikSatiri({ e, bugun, onHata }: { e: Etkinlik; bugun: boolean; onHata: (m: string) => void }) {
  if (e.tur === 'sinav') {
    return (
      <li class="etkinlik sinav">
        <strong>Sınav günü</strong>
        <span class="soluk kucuk">Başarılar! Sınavdan önce kısa bir kelime tekrarı yeterli.</span>
      </li>
    );
  }
  if (e.tur === 'test') {
    return (
      <li class="etkinlik">
        <div class="satir-ust">
          <strong>
            {e.adet} {e.teshis ? 'teşhis' : 'uyarlanmış'} test
          </strong>
          <span class="soluk kucuk">{sureMetni(e.dakika)}</span>
        </div>
        <span class="soluk kucuk">{e.adet * 10} soru; test sonunda konu analizine göz at.</span>
        {bugun && (
          <button class="dugme birincil kucuk-dugme" onClick={() => testBaslat(onHata)}>
            Teste başla
          </button>
        )}
      </li>
    );
  }
  if (e.tur === 'tekrar') {
    return (
      <li class="etkinlik">
        <div class="satir-ust">
          <strong>Aralıklı tekrar</strong>
          <span class="soluk kucuk">{sureMetni(e.dakika)}</span>
        </div>
        <span class="soluk kucuk">Sırası gelen yanlışlarını yeniden çöz, açıklamaları oku; varsa kelime kartlarına da bak.</span>
        {bugun && (
          <a class="dugme ikincil kucuk-dugme" href="#/yanlislar">
            Tekrar listesine git
          </a>
        )}
      </li>
    );
  }
  const konu = KONU_MAP.get(e.konu);
  return (
    <li class="etkinlik">
      <details>
        <summary>
          <span class="satir-ust">
            <strong>Konu: {konuAdi(e.konu)}</strong>
            <span class="soluk kucuk">{sureMetni(e.dakika)}</span>
          </span>
        </summary>
        <p class="kucuk">{konu?.oneri}</p>
        <div class="dugme-satiri">
          <a class="dugme ikincil kucuk-dugme" href={`#/konu/${e.konu}`}>
            Konu kartını aç
          </a>
          {bugun && (
            <button class="dugme metin kucuk-dugme" onClick={() => konuTestiBaslat(e.konu, onHata)}>
              5 soru çöz
            </button>
          )}
        </div>
      </details>
    </li>
  );
}

export function GunKarti({ gun, onHata }: { gun: ProgramGunu; onHata: (m: string) => void }) {
  const bugun = gun.tarih === tarihMetni(new Date());
  const toplam = gun.etkinlikler.reduce((t, e) => t + (e.tur === 'sinav' ? 0 : e.dakika), 0);
  return (
    <section class={`kart gun-karti${gun.dinlenme ? ' dinlenme' : ''}`} aria-label={gunBasligi(gun.tarih)}>
      <div class="satir-ust">
        <h2>
          {bugun && <span class="bugun-etiketi">Bugün</span>} {gunBasligi(gun.tarih)}
        </h2>
        {toplam > 0 && <span class="soluk kucuk">{sureMetni(toplam)}</span>}
      </div>
      {gun.dinlenme ? (
        <p class="soluk kucuk">
          Dinlenme günü. İstersen 10 dakikalık <a href="#/kelimeler">kelime tekrarı</a> yeterli.
        </p>
      ) : (
        <ul class="etkinlik-listesi">
          {gun.etkinlikler.map((e) => (
            <EtkinlikSatiri e={e} bugun={bugun} onHata={onHata} />
          ))}
        </ul>
      )}
    </section>
  );
}

const DAKIKALAR = [30, 45, 60, 90, 120, 150, 180];
const GUNLER = [3, 4, 5, 6, 7];

export function Program({ ayar, degistir }: { ayar: Ayarlar; degistir: (a: Partial<Ayarlar>) => void }) {
  const [hata, setHata] = useState<string | null>(null);
  const { veri, hata: yuklemeHatasi } = useVeri(
    () => programVerisi(ayar),
    [ayar.gunluk_dakika, ayar.haftalik_gun, ayar.sinav_tarihi],
  );
  if (!veri) return <Yukleniyor hata={yuklemeHatasi} />;
  const { program, yanlisSayisi } = veri;
  const enFazlaBlok = Math.max(1, ...program.odak.map((o) => o.blok));

  return (
    <Sayfa menu="program">
      <Ust baslik="Ders Programı" />

      <section class="kart">
        <h2>Çalışma düzenin</h2>
        <div class="program-ayarlar">
          <label class="alan">
            <span class="soluk kucuk">Günlük süre</span>
            <select value={ayar.gunluk_dakika} onChange={(e) => degistir({ gunluk_dakika: Number((e.target as HTMLSelectElement).value) })}>
              {DAKIKALAR.map((d) => (
                <option value={d}>{sureMetni(d)}</option>
              ))}
            </select>
          </label>
          <label class="alan">
            <span class="soluk kucuk">Haftada</span>
            <select value={ayar.haftalik_gun} onChange={(e) => degistir({ haftalik_gun: Number((e.target as HTMLSelectElement).value) })}>
              {GUNLER.map((g) => (
                <option value={g}>{g} gün</option>
              ))}
            </select>
          </label>
          <label class="alan tam">
            <span class="soluk kucuk">Sınav tarihi (isteğe bağlı)</span>
            <input
              type="date"
              value={ayar.sinav_tarihi ?? ''}
              onChange={(e) => degistir({ sinav_tarihi: (e.target as HTMLInputElement).value || null })}
            />
          </label>
        </div>
      </section>

      <section class="kart vurgu">
        <p class="etiket-ust">{ASAMA_AD[program.asama]}</p>
        <p class="buyuk-metin">Bu hafta {sureMetni(program.haftalikDakika)}</p>
        {program.sinavaKalanGun !== null && (
          <p>
            Sınava <strong>{program.sinavaKalanGun === 0 ? 'bugün' : `${program.sinavaKalanGun} gün`}</strong>
            {program.sinavaKalanGun > 0 && ' kaldı'}.
          </p>
        )}
        {program.notlar.map((n) => (
          <p class="soluk kucuk">{notMetni(n, yanlisSayisi)}</p>
        ))}
        {hata && (
          <p class="hata-kutu" role="alert">
            {hata}
          </p>
        )}
      </section>

      {program.odak.length > 0 && (
        <section class="kart">
          <h2>Bu haftanın odak konuları</h2>
          <p class="soluk kucuk">Eksikliği yüksek ve sınavda ağırlığı büyük konulara daha çok oturum ayrıldı.</p>
          <ul class="konu-listesi">
            {program.odak.map((o) => (
              <li>
                <div class="satir-ust">
                  <span>{konuAdi(o.konu)}</span>
                  <span class="soluk kucuk">
                    {o.blok} oturum · {o.deneme > 0 ? `%${o.eksiklikYuzde} eksik` : 'henüz ölçülmedi'}
                  </span>
                </div>
                <Cubuk yuzde={(o.blok / enFazlaBlok) * 100} ton="notr" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {program.gunler.map((g) => (
        <GunKarti gun={g} onHata={setHata} />
      ))}

      <p class="soluk kucuk orta">Program her gün güncel istatistiklerine göre yeniden hesaplanır.</p>
    </Sayfa>
  );
}
