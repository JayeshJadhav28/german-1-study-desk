import { el, mount, pageHead, notice } from '../ui';
import { breadcrumbs } from '../ui';

const PORTFOLIO = 'https://jayeshjadhav.com';
const CREATOR = 'Jayesh Jadhav';

function setBreadcrumb(): void {
  const host = document.getElementById('crumb-slot');
  if (!host) return;
  mount(host, breadcrumbs([{ label: 'Home', href: '/' }, { label: 'About' }])!);
}

export async function renderAbout(c: HTMLElement): Promise<void> {
  setBreadcrumb();

  const portfolioLink = el('a', {
    href: PORTFOLIO,
    target: '_blank',
    rel: 'noopener noreferrer',
    text: PORTFOLIO,
  });

  mount(c,
    pageHead('About this project', 'An independent learning companion for the NPTEL/SWAYAM German I course.'),
    notice('Not an official NPTEL or SWAYAM website. Course content, videos and materials belong to the original course providers.'),
    el('div', { class: 'panel' }, [
      el('strong', { text: 'What this is' }),
      el('p', { style: 'margin:.4rem 0 0' }, [
        'German I Study Desk is a personal, independent study tool. It organises the course outline, lessons, grammar notes, vocabulary, practice questions and revision aids into one searchable place, with progress saved locally in your browser.',
      ]),
      el('p', { style: 'margin:.4rem 0 0' }, [
        'It is not affiliated with, endorsed by, or operated by NPTEL, SWAYAM, or any course institution. It does not replace the official course pages, lectures or exam notices — always check those for dates, scoring and certification rules.',
      ]),
    ]),
    el('div', { class: 'panel' }, [
      el('strong', { text: 'Creator' }),
      el('p', { style: 'margin:.4rem 0 0' }, [
        `Designed & built by `,
        el('a', { href: PORTFOLIO, target: '_blank', rel: 'noopener noreferrer', text: CREATOR }),
        '. ',
      ]),
    ]),
    el('div', { class: 'panel' }, [
      el('strong', { text: 'What it includes' }),
      el('ul', { style: 'margin:.4rem 0 0;padding-left:1.2rem' }, [
        el('li', { text: 'Week-by-week syllabus with themes, grammar topics and lesson lists' }),
        el('li', { text: 'Grammar hub and vocabulary tables with search and filters' }),
        el('li', { text: 'Practice question bank with provenance labels (local full edition)' }),
        el('li', { text: 'Revision plan, mock practice tests and study-resource link catalog' }),
        el('li', { text: 'Transcript reader and document reader (local full edition)' }),
      ]),
    ]),
    el('div', { class: 'panel' }, [
      el('strong', { text: 'Content and rights' }),
      el('p', { style: 'margin:.4rem 0 0' }, [
        'Course-derived material (lesson pages, lecture subtitles, assignment questions, answers) stays in the private local edition because redistribution rights are not confirmed. The public edition shares only the course outline, links, and this site\u2019s own study aids.',
      ]),
      el('p', { style: 'margin:.4rem 0 0' }, [
        'No answer is ever invented: questions without a verified key are labelled as such.',
      ]),
    ]),
    el('div', { class: 'panel' }, [
      el('strong', { text: 'More from the creator' }),
      el('p', { style: 'margin:.4rem 0 0' }, [
        'See other projects at ', portfolioLink, '.',
      ]),
    ]),
  );
}
