<?php

namespace App\Http\Requests\Search;

use App\Http\Requests\ApiRequest;

class IndexSearchRequest extends ApiRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'q' => ['required', 'string', 'max:255'],
        ];
    }
}
